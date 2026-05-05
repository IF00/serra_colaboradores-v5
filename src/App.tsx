import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Search, MapPin, FileText, Navigation, Loader2, Plus, X, CheckCircle2, AlertCircle, Pencil, Upload, FileJson, FileSpreadsheet, Maximize, Trash2, Download, Star, ArrowUpDown } from "lucide-react";
import * as XLSX from "xlsx";
import { INITIAL_SEED_DATA } from "./seedData";


console.log("App rendering...");

// Fix for Leaflet default icon issues using CDN URLs
// --- CUSTOMIZAÇÃO DE ÍCONES ---
// Se quiser mudar o ícone do marcador no mapa, altere as URLs abaixo.
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

// Ícone personalizado verde para o ponto de pesquisa
const SearchIcon = L.divIcon({
  className: 'search-location-icon',
  html: `<div class="w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Provider {
  id: number;
  name: string;
  type: string;
  document: string;
  contact: string;
  service: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number;
  status: string;
  rating?: number;
}

// Component to listen for map events
function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

function MapEvents({ onMove, onZoom }: { onMove: (lat: number, lng: number) => void; onZoom: (zoom: number) => void }) {
  useMapEvents({
    moveend: (e) => {
      const center = e.target.getCenter();
      onMove(center.lat, center.lng);
    },
    zoomend: (e) => {
      onZoom(e.target.getZoom());
    }
  });
  return null;
}

function FitBounds({ trigger, providers }: { trigger: number; providers: Provider[] }) {
  const map = useMap();
  useEffect(() => {
    if (trigger > 0) {
      const valid = providers.filter(p => p.latitude !== 0 && !isNaN(p.latitude));
      if (valid.length > 0) {
        const bounds = L.latLngBounds(valid.map(p => [p.latitude, p.longitude]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [trigger]);
  return null;
}

export default function App() {
  console.log("App component rendering...");
  const [searchQuery, setSearchQuery] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [allProviders, setAllProviders] = useState<Provider[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-23.5505, -46.6333]); // São Paulo default
  const [searchLocation, setSearchLocation] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState(13);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Registration/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTableOpen, setIsTableOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const [retryProgress, setRetryProgress] = useState({ current: 0, total: 0 });
  const [tableSearch, setTableSearch] = useState("");
  const [showAllInSidebar, setShowAllInSidebar] = useState(true);
  const [searchRadius, setSearchRadius] = useState(150);
  const [sortBy, setSortBy] = useState<'rating-desc' | 'rating-asc' | 'name' | 'distance' | null>('distance');
  const [editingProviderId, setEditingProviderId] = useState<number | null>(null);
  const [newProvider, setNewProvider] = useState({
    name: "",
    type: "F",
    document: "",
    contact: "",
    service: "",
    address: "",
    latitude: 0,
    longitude: 0,
    radius: 10,
    status: "Ativo",
    rating: 0
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [logs, setLogs] = useState<{ id: number; message: string; type: 'info' | 'success' | 'error' | 'warning'; timestamp: string }[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const newLog = {
      id: Date.now() + Math.random(),
      message,
      type,
      timestamp: new Date().toLocaleTimeString()
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50)); // Keep last 50 logs
  };

  useEffect(() => {
    // Detect if running in Electron
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.indexOf(' electron/') > -1) {
      setIsElectron(true);
    }
  }, []);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Sync providers based on map center and allProviders
  const displayedProviders = React.useMemo(() => {
    // 1. Filtrar ativos
    let result = allProviders.filter(p => p.status === 'Ativo');
    
    // 2. Se não estiver em modo "Ver Todos", filtrar por distância
    if (!showAllInSidebar) {
      result = result.filter(p => {
        if (!p.latitude || isNaN(p.latitude) || p.latitude === 0) return false;
        const distance = calculateDistance(mapCenter[0], mapCenter[1], p.latitude, p.longitude);
        return distance <= searchRadius;
      });
    } else {
      // No modo "Ver Todos", ainda queremos remover quem não tem coordenadas para não quebrar o mapa
      // mas o filtro opcional de distância é ignorado.
      result = result.filter(p => p.latitude !== 0 && !isNaN(p.latitude));
    }

    // 3. Aplicar ordenação
    const sorted = [...result];
    
    if (sortBy === 'distance') {
      sorted.sort((a, b) => {
        const distA = calculateDistance(mapCenter[0], mapCenter[1], a.latitude, a.longitude);
        const distB = calculateDistance(mapCenter[0], mapCenter[1], b.latitude, b.longitude);
        return distA - distB;
      });
    } else if (sortBy === 'rating-desc') {
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'rating-asc') {
      sorted.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return sorted;
  }, [allProviders, mapCenter, searchRadius, sortBy, showAllInSidebar]);

  // Manter providers sync para compatibilidade com partes que usam esse estado (se houver)
  useEffect(() => {
    setProviders(displayedProviders);
  }, [displayedProviders]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    addLog(`Iniciando busca por: "${searchQuery}"`, 'info');

    try {
      // Nominatim Geocoding API com parâmetros de identificação
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&addressdetails=1&limit=1`,
        {
          headers: {
            'Accept-Language': 'pt-BR'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Servidor de mapas respondeu com erro: ${response.status}`);
      }

      const data = await response.json();

      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);
        
        addLog(`Localização encontrada: ${display_name}`, 'success');
        const coords: [number, number] = [newLat, newLng];
        setMapCenter(coords);
        setSearchLocation(coords);
        setZoom(13);
      } else {
        addLog(`Endereço não encontrado: "${searchQuery}". Tente ser mais específico (Cidade, Estado).`, 'warning');
        setError("Localização não encontrada.");
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Erro de conexão';
      addLog(`Erro na busca: ${msg}. Verifique sua internet ou tente novamente em instantes.`, 'error');
      setError(`Erro na busca: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (provider: Provider) => {
    setEditingProviderId(provider.id);
    setNewProvider({
      name: provider.name,
      type: provider.type || "F",
      document: provider.document || "",
      contact: provider.contact || "",
      service: provider.service,
      address: provider.address,
      latitude: provider.latitude,
      longitude: provider.longitude,
      radius: provider.radius,
      status: provider.status,
      rating: provider.rating || 0
    });
    setIsModalOpen(true);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    
    try {
      addLog(`Iniciando salvamento de: ${newProvider.name}`, 'info');
      let latitude = newProvider.latitude;
      let longitude = newProvider.longitude;

      // Se as coordenadas forem 0, tentamos geocodificar pelo endereço
      if (latitude === 0 && longitude === 0) {
        addLog(`Geocodificando endereço: ${newProvider.address}`, 'info');
        const geoResponse = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newProvider.address)}`
        );
        const geoData = await geoResponse.json();

        if (geoData && geoData.length > 0) {
          latitude = parseFloat(geoData[0].lat);
          longitude = parseFloat(geoData[0].lon);
          addLog(`Coordenadas obtidas: ${latitude}, ${longitude}`, 'success');
        } else {
          addLog(`Falha ao geocodificar endereço: ${newProvider.address}`, 'error');
          alert("Endereço não encontrado e coordenadas não informadas.");
          setIsRegistering(false);
          return;
        }
      }

      let updatedAllProviders: Provider[];

      if (editingProviderId) {
        updatedAllProviders = allProviders.map(p => 
          p.id === editingProviderId 
            ? { ...newProvider, id: editingProviderId, latitude, longitude } 
            : p
        );
        addLog(`Colaborador "${newProvider.name}" atualizado com sucesso.`, 'success');
      } else {
        const newId = allProviders.length > 0 ? Math.max(...allProviders.map(p => p.id)) + 1 : 1;
        const providerToAdd = { ...newProvider, id: newId, latitude, longitude };
        updatedAllProviders = [...allProviders, providerToAdd];
        addLog(`Novo colaborador "${newProvider.name}" cadastrado com sucesso.`, 'success');
      }

      setAllProviders(updatedAllProviders);
      localStorage.setItem("geoservice_providers", JSON.stringify(updatedAllProviders));

      setIsModalOpen(false);
      setEditingProviderId(null);
      setNewProvider({ 
        name: "", 
        type: "F", 
        document: "",
        contact: "", 
        service: "", 
        address: "", 
        latitude: 0, 
        longitude: 0, 
        radius: 10, 
        status: "Ativo",
        rating: 0
      });
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar dados localmente.");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    addLog(`Iniciando importação do arquivo: ${file.name}`, 'info');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        let data: any[] = [];

        if (file.name.endsWith(".json")) {
          data = JSON.parse(bstr as string);
        } else {
          const wb = XLSX.read(bstr, { type: "binary" });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          data = XLSX.utils.sheet_to_json(ws);
        }

        if (!Array.isArray(data)) {
          throw new Error("Formato de arquivo inválido. Deve ser um array de objetos.");
        }

        addLog(`Arquivo lido. Processando ${data.length} registros...`, 'info');

        // Process data and geocode if necessary
        const processedData = [];
        for (let i = 0; i < data.length; i++) {
          const item = data[i];
          const provider = {
            name: item.name || item.Nome || item.NOME || "Sem nome",
            type: item.type || item.Tipo || item.TIPO || "F",
            document: item.document || item["CPF/CNPJ"] || "",
            contact: item.contact || item.Contato || item.CONTATO || "",
            service: item.service || item.Descrição || item.DESCRIÇÃO || item.Observação || item.Serviço || "",
            address: item.address || item.Endereço || item.ENDERECO || "",
            radius: parseFloat(item.radius || item.Raio || 10),
            status: item.status || item.Status || "Ativo",
            rating: parseFloat(item.rating || item.Nota || item.Avaliação || 0),
            latitude: parseFloat(item.latitude || item.Latitude || 0),
            longitude: parseFloat(item.longitude || item.Longitude || 0),
          };

          // If coordinates are missing, try to geocode (limit to avoid rate limits)
          if (provider.latitude === 0 && provider.address) {
            try {
              addLog(`[${i+1}/${data.length}] Geocodificando: ${provider.name}`, 'info');
              const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(provider.address)}&limit=1`,
                {
                  headers: {
                    'Accept-Language': 'pt-BR'
                  }
                }
              );
              
              if (!geoRes.ok) throw new Error(`Status ${geoRes.status}`);
              
              const geoData = await geoRes.json();
              if (geoData && geoData.length > 0) {
                provider.latitude = parseFloat(geoData[0].lat);
                provider.longitude = parseFloat(geoData[0].lon);
                addLog(`[${i+1}/${data.length}] OK: ${provider.name}`, 'success');
              } else {
                addLog(`[${i+1}/${data.length}] Não encontrado: ${provider.address}`, 'warning');
              }
              
              // Aumentado para 1.5s para respeitar limites do Nominatim e evitar bloqueios
              await new Promise(r => setTimeout(r, 1500));
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Falha de rede';
              addLog(`[${i+1}/${data.length}] Erro em "${provider.name}": ${msg}`, 'error');
              // Espera um pouco mais em caso de erro para "limpar" o limite
              await new Promise(r => setTimeout(r, 2000));
            }
          } else {
            addLog(`[${i+1}/${data.length}] Já possui coordenadas: ${provider.name}`, 'info');
          }
          processedData.push(provider);
        }

        let currentMaxId = allProviders.length > 0 ? Math.max(...allProviders.map(p => p.id)) : 0;
        const providersWithIds = processedData.map(p => ({
          ...p,
          id: ++currentMaxId
        })) as Provider[];

        const updatedAllProviders = [...allProviders, ...providersWithIds];
        setAllProviders(updatedAllProviders);
        localStorage.setItem("geoservice_providers", JSON.stringify(updatedAllProviders));

        addLog(`Importação concluída: ${processedData.length} prestadores adicionados.`, 'success');
        alert(`${processedData.length} prestadores importados com sucesso!`);
      } catch (err: any) {
        console.error(err);
        setError(`Erro na importação: ${err.message}`);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    if (file.name.endsWith(".json")) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        NOME: "Exemplo Prestador",
        TIPO: "F",
        "CPF/CNPJ": "000.000.000-00",
        CONTATO: "Nome - (00) 00000-0000",
        DESCRIÇÃO: "Serviço de Exemplo",
        ENDERECO: "Rua Exemplo, 123, Cidade, Estado",
        Raio: 10,
        Status: "Ativo",
        Nota: 5.0,
        Latitude: 0,
        Longitude: 0
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo_geoservice.xlsx");
    addLog("Modelo de planilha baixado.", "info");
  };

  const deleteProvider = (id: number) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = () => {
    if (confirmDeleteId === null) return;
    
    const providerToDelete = allProviders.find(p => p.id === confirmDeleteId);
    if (!providerToDelete) {
      setConfirmDeleteId(null);
      return;
    }

    const updated = allProviders.filter(p => p.id !== confirmDeleteId);
    setAllProviders(updated);
    localStorage.setItem("geoservice_providers", JSON.stringify(updated));
    addLog(`Colaborador "${providerToDelete.name}" removido.`, 'warning');
    setConfirmDeleteId(null);
  };

  const exportToCsv = () => {
    if (allProviders.length === 0) {
      addLog("Nenhum registro para exportar.", "warning");
      return;
    }

    // Preparar dados para o Excel/CSV
    const dataToExport = allProviders.map(p => ({
      ID: p.id,
      Nome: p.name,
      Tipo: p.type,
      Documento: p.document,
      Contato: p.contact,
      Serviço: p.service,
      Endereço: p.address,
      Latitude: p.latitude,
      Longitude: p.longitude,
      Raio: p.radius,
      Status: p.status,
      Nota: p.rating || 0
    }));

    // Usar a biblioteca XLSX para gerar o CSV (garante formatação correta com ; para Excel BR)
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    
    // Adicionar BOM para o Excel reconhecer caracteres especiais (UTF-8)
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `colaboradores_serra_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    addLog("Registros exportados para CSV com sucesso.", "success");
  };

  const retryGeocoding = async (provider: Provider) => {
    addLog(`Tentando localizar novamente: ${provider.name}`, 'info');
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(provider.address)}&limit=1`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        
        const updated = allProviders.map(p => 
          p.id === provider.id ? { ...p, latitude: lat, longitude: lng } : p
        );
        
        setAllProviders(updated);
        localStorage.setItem("geoservice_providers", JSON.stringify(updated));
        addLog(`Localização atualizada para ${provider.name}!`, 'success');
      } else {
        addLog(`Endereço ainda não encontrado para: ${provider.name}`, 'warning');
        alert("Não foi possível encontrar este endereço. Tente editar e ser mais específico.");
      }
    } catch (err) {
      addLog(`Erro ao conectar ao serviço de mapas.`, 'error');
    }
  };

  const retryAllFailedGeocoding = async () => {
    // Check for both 0 and NaN or invalid coordinates
    const failedOnes = allProviders.filter(p => !p.latitude || isNaN(p.latitude) || p.latitude === 0);
    
    if (failedOnes.length === 0) {
      addLog("Nenhum registro pendente de localização encontrado.", "info");
      return;
    }

    setIsRetryingAll(true);
    setRetryProgress({ current: 0, total: failedOnes.length });
    addLog(`Iniciando localização em massa de ${failedOnes.length} registros...`, 'info');

    let currentAll = [...allProviders];
    let successCount = 0;

    for (let i = 0; i < failedOnes.length; i++) {
      setRetryProgress({ current: i + 1, total: failedOnes.length });
      const provider = failedOnes[i];
      addLog(`[${i + 1}/${failedOnes.length}] Tentando: ${provider.name}`, 'info');

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(provider.address)}&limit=1`,
          { headers: { 'Accept-Language': 'pt-BR' } }
        );
        
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        
        const data = await response.json();

        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          
          currentAll = currentAll.map(p => 
            p.id === provider.id ? { ...p, latitude: lat, longitude: lng } : p
          );
          
          // Update state immediately so the table reflects progress
          setAllProviders([...currentAll]);
          localStorage.setItem("geoservice_providers", JSON.stringify(currentAll));
          
          successCount++;
          addLog(`[${i + 1}/${failedOnes.length}] OK: ${provider.name}`, 'success');
        } else {
          addLog(`[${i + 1}/${failedOnes.length}] Não encontrado: ${provider.name}`, 'warning');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro de conexão';
        addLog(`[${i + 1}/${failedOnes.length}] Erro em ${provider.name}: ${msg}`, 'error');
      }

      // Respect rate limit
      await new Promise(r => setTimeout(r, 1500));
    }

    setIsRetryingAll(false);
    addLog(`Processo concluído! ${successCount} registros localizados com sucesso.`, 'success');
  };

  const clearDatabase = () => {
    if (window.confirm("ATENÇÃO: Isso apagará TODOS os prestadores cadastrados. Deseja continuar?")) {
      setAllProviders([]);
      setProviders([]);
      localStorage.removeItem("geoservice_providers");
      addLog("Banco de dados limpo pelo usuário.", "warning");
    }
  };

  // Initial load
  useEffect(() => {
    addLog('Iniciando aplicação...', 'info');
    
    const normalizeCoordinate = (coord: number) => {
      if (!coord || coord === 0) return 0;
      if (Math.abs(coord) > 180) {
        let normalized = coord;
        while (Math.abs(normalized) > 180) {
          normalized /= 10;
        }
        return normalized;
      }
      return coord;
    };

    const saved = localStorage.getItem("geoservice_providers");
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrated = parsed.map((p: any) => ({
          ...p,
          rating: p.rating !== undefined ? (p.rating > 10 ? p.rating / 10 : p.rating) : 0,
          latitude: normalizeCoordinate(p.latitude || 0),
          longitude: normalizeCoordinate(p.longitude || 0)
        }));
        setAllProviders(migrated);
        addLog(`${parsed.length} prestadores carregados do armazenamento local.`, 'success');
      } catch (e) {
        console.error("Failed to parse localStorage data", e);
        addLog('Erro ao carregar dados salvos. Resetando para dados iniciais.', 'error');
        localStorage.removeItem("geoservice_providers");
        window.location.reload();
      }
    } else {
      addLog('Nenhum dado encontrado. Carregando dados iniciais...', 'info');
      // Use the imported INITIAL_SEED_DATA
      const normalizedSeed = INITIAL_SEED_DATA.map(p => ({
        ...p,
        latitude: normalizeCoordinate(p.latitude),
        longitude: normalizeCoordinate(p.longitude)
      }));
      setAllProviders(normalizedSeed);
      addLog(`${normalizedSeed.length} prestadores iniciais carregados.`, 'success');
    }
  }, []);



  return (
    <div className="flex flex-col h-screen bg-stone-50 font-sans text-stone-900">
      {/* 
        HEADER / BARRA DE BUSCA
        - bg-white: Cor de fundo do cabeçalho
        - border-stone-200: Cor da linha de divisão
      */}
      <header className="bg-white border-b border-stone-200 p-4 shadow-sm z-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* LOGO E NOME DA APLICAÇÃO */}
          <div className="flex items-center gap-2">
            {/* Ícone do Logo - Mude bg-emerald-600 para trocar a cor do quadrado */}
            <div className="bg-emerald-600 p-2 rounded-lg text-white">
              <Navigation size={24} />
            </div>
            {/* Texto do Logo - Mude text-emerald-600 para trocar a cor da segunda palavra */}
            <h1 className="text-xl font-bold tracking-tight text-stone-800">
              Serra <span className="text-emerald-600">Colaboradores</span>
            </h1>
            <div className="flex items-center gap-1">
              {isElectron && (
                <span className="bg-stone-200 text-stone-600 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Desktop
                </span>
              )}
              <button 
                onClick={() => setShowLogs(!showLogs)}
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider transition-colors ${showLogs ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}`}
              >
                Logs
              </button>
              <button 
                onClick={() => setIsTableOpen(true)}
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-stone-800 text-white hover:bg-black transition-colors"
              >
                Tabela Geral
              </button>
              <button 
                onClick={exportToCsv}
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center gap-1 border border-emerald-200"
              >
                <FileSpreadsheet size={10} /> Exportar para Excel (CSV)
              </button>
            </div>
            {/* DICA: Para adicionar uma imagem de logo, use: <img src="/logo.png" className="h-8" alt="Logo" /> */}
          </div>

          <div className="flex flex-1 max-w-2xl gap-2">
            <form onSubmit={handleSearch} className="relative flex-1">
              {/* Campo de Busca - bg-stone-100 é o fundo cinza claro */}
              <input
                type="text"
                placeholder="Pesquisar cidade ou endereço para centralizar..."
                className="w-full pl-10 pr-4 py-2 bg-stone-100 border border-stone-200 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              
              {/* Botão de Busca - bg-emerald-600 é a cor verde */}
              <button 
                type="submit" 
                disabled={loading}
                className="absolute right-1 top-1/2 -translate-y-1/2 bg-emerald-600 text-white px-4 py-1 rounded-full text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : "Buscar"}
              </button>
            </form>

            <div className="flex gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".xlsx,.xls,.json" 
                className="hidden" 
              />
              {/* Botão de Download Modelo */}
              <button
                onClick={downloadTemplate}
                title="Baixar Modelo de Tabela (Excel)"
                className="flex items-center justify-center bg-stone-100 text-stone-600 w-10 h-10 rounded-full hover:bg-stone-200 transition-colors shrink-0"
              >
                <FileSpreadsheet size={18} />
              </button>

              {/* Botão de Importar */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                title="Importar Excel ou JSON"
                className="flex items-center justify-center bg-stone-100 text-stone-600 w-10 h-10 rounded-full hover:bg-stone-200 transition-colors shrink-0"
              >
                {isImporting ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
              </button>

              {/* Botão de Cadastrar - bg-stone-800 é a cor preta/cinza escuro */}
              <button
                onClick={() => {
                  setEditingProviderId(null);
                  setNewProvider({ 
                    name: "", 
                    type: "F", 
                    document: "",
                    contact: "", 
                    service: "", 
                    address: "", 
                    latitude: 0, 
                    longitude: 0, 
                    radius: 10, 
                    status: "Ativo",
                    rating: 0
                  });
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-2 bg-stone-800 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-stone-900 transition-colors shrink-0"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Cadastrar</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full md:w-80 lg:w-96 bg-white border-r border-stone-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
                {showAllInSidebar ? allProviders.length : providers.length} Prestadores
              </h2>
              <button 
                onClick={() => setShowAllInSidebar(!showAllInSidebar)}
                className={`text-[10px] px-2 py-1 rounded border transition-colors font-bold ${showAllInSidebar ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-stone-300 text-stone-500 hover:bg-stone-100'}`}
              >
                {showAllInSidebar ? "VER PRÓXIMOS" : "VER TODOS"}
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-stone-400 uppercase">Classificar por:</span>
              <select 
                value={sortBy || ""} 
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-[10px] bg-white border border-stone-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
              >
                <option value="distance">Mais Próximos (Distância)</option>
                <option value="rating-desc">Melhores Avaliados (★)</option>
                <option value="rating-asc">Menores Avaliados</option>
                <option value="name">Ordem Alfabética (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Controle de Raio de Pesquisa */}
          <div className="p-4 border-b border-stone-100 bg-white">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-stone-500 uppercase flex items-center gap-1.5">
                <Navigation size={14} className="text-emerald-600" />
                Raio de Pesquisa
              </label>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                {searchRadius} km
              </span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="1000" 
              step="1"
              value={searchRadius}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setSearchRadius(val);
                addLog(`Raio de pesquisa alterado para ${val}km.`, "info");
              }}
              className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-stone-400 font-medium">1km</span>
              <span className="text-[10px] text-stone-400 font-medium">1000km</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
              {displayedProviders.length > 0 ? (
                displayedProviders.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 border-b border-stone-100 hover:bg-emerald-50/30 cursor-pointer transition-colors group relative"
                    onClick={() => {
                      setMapCenter([p.latitude, p.longitude]);
                      setZoom(15);
                    }}
                  >
                    {/* CARD DO PRESTADOR NA LISTA */}
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center justify-between w-full">
                          <h3 className="font-bold text-stone-800 group-hover:text-emerald-700 transition-colors truncate pr-2">{p.name}</h3>
                          {p.rating !== undefined && (
                            <div className="flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-lg text-[11px] font-bold border border-amber-200 shrink-0 shadow-sm">
                              <Star size={12} fill="currentColor" className="text-amber-500" />
                              {p.rating.toFixed(1)}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded w-fit">
                            {p.type === 'J' ? 'PJ' : 'PF'}
                          </span>
                          {p.document && (
                            <span className="text-[10px] font-medium text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded w-fit">
                              {p.document}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {/* Tag de Raio - bg-emerald-100 é o fundo verde claro */}
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                          {p.radius}km raio
                        </span>
                        {/* Distância do centro do mapa/pesquisa */}
                        <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <Navigation size={10} />
                          {calculateDistance(mapCenter[0], mapCenter[1], p.latitude, p.longitude).toFixed(1)} km
                        </span>
                        {/* Tag de Status - bg-blue-100 (Ativo) ou bg-stone-200 (Inativo) */}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.status === 'Ativo' ? 'bg-blue-100 text-blue-700' : 'bg-stone-200 text-stone-600'}`}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-stone-600 mb-1">
                      <FileText size={14} className="text-stone-400" />
                      <span>{p.service}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1">
                      <MapPin size={14} className="text-stone-400" />
                      <span className="truncate">{p.address}</span>
                    </div>
                    {p.contact && (
                      <div className="flex items-start gap-1.5 text-[11px] text-emerald-600 bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100/50">
                        <Navigation size={12} className="shrink-0 mt-0.5" />
                        <span className="whitespace-pre-wrap line-clamp-2">{p.contact}</span>
                      </div>
                    )}

                    {/* Edit and Delete Buttons */}
                    <div className="absolute top-4 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(p);
                        }}
                        className="p-1.5 text-stone-400 hover:text-emerald-600 hover:bg-white rounded-full shadow-sm border border-stone-100 bg-stone-50"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProvider(p.id);
                        }}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-white rounded-full shadow-sm border border-stone-100 bg-stone-50"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-stone-400">
                  <p>Nenhum prestador encontrado nesta região.</p>
                  <p className="text-sm mt-2">Tente buscar por outra cidade ou endereço.</p>
                </div>
              )}
          </div>

          {/* Log Section */}
          {showLogs && (
            <div className="h-48 border-t border-stone-200 bg-stone-900 text-[10px] font-mono p-2 overflow-y-auto flex flex-col-reverse">
              {logs.map((log) => (
                <div key={log.id} className="mb-1 border-b border-stone-800 pb-1">
                  <span className="text-stone-500 mr-2">[{log.timestamp}]</span>
                  <span className={
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'warning' ? 'text-amber-400' :
                    'text-stone-300'
                  }>
                    {log.message}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center mb-2 border-b border-stone-700 pb-1">
                <span className="text-stone-400 font-bold uppercase">Console de Operações</span>
                <button onClick={() => setLogs([])} className="text-stone-500 hover:text-white">Limpar</button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 m-4 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">
              {error}
            </div>
          )}
        </aside>

        {/* Map Container */}
        <div className="flex-1 relative z-0">
          <MapContainer 
            center={mapCenter} 
            zoom={zoom} 
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {/* PERÍMETRO DE PESQUISA DINÂMICO */}
            <Circle
              center={mapCenter}
              radius={searchRadius * 1000} // Converte km para metros
              pathOptions={{
                fill: true,
                fillColor: "#10b981", // Emerald 500
                fillOpacity: 0.15,
                color: "#059669",     // Emerald 600
                weight: 2,
                dashArray: "5, 10",   // Linha tracejada
                opacity: 0.5,
              }}
            />

            {/* MARCADOR DO ENDEREÇO PESQUISADO (PONTO VERDE) */}
            {searchLocation && (
              <Marker position={searchLocation} icon={SearchIcon}>
                <Popup>
                  <div className="text-xs font-bold text-emerald-700">Local da Pesquisa</div>
                </Popup>
              </Marker>
            )}
            
            <ChangeView center={mapCenter} zoom={zoom} />
            <MapEvents 
              onMove={(lat, lng) => setMapCenter([lat, lng])} 
              onZoom={(z) => setZoom(z)}
            />
            <FitBounds trigger={fitTrigger} providers={displayedProviders} />
            
            {displayedProviders.map((p) => (
              <React.Fragment key={p.id}>
                <Marker position={[p.latitude, p.longitude]}>
                  <Popup>
                    <div className="p-1 min-w-[150px]">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="font-bold text-stone-800 truncate pr-2">{p.name}</h4>
                        <div className="flex gap-1 items-center shrink-0">
                          {p.rating !== undefined && (
                            <div className="flex items-center gap-1 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-lg text-[10px] font-bold border border-amber-200 shadow-sm mr-1">
                              <Star size={10} fill="currentColor" className="text-amber-500" />
                              {p.rating.toFixed(1)}
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                            {p.type === 'J' ? 'PJ' : 'PF'}
                          </span>
                        </div>
                      </div>
                      {p.document && (
                        <p className="text-[10px] text-stone-500 mb-1 font-mono">{p.document}</p>
                      )}
                      <p className="text-xs text-stone-600 flex items-center gap-1">
                        <FileText size={12} /> {p.service}
                      </p>
                      {p.contact && (
                        <p className="text-xs text-stone-600 mt-1 flex items-start gap-1">
                          <Navigation size={12} className="shrink-0 mt-0.5" /> 
                          <span className="whitespace-pre-wrap">{p.contact}</span>
                        </p>
                      )}
                      <p className="text-xs text-stone-400 mt-1 flex items-start gap-1">
                        <MapPin size={12} className="shrink-0 mt-0.5" /> {p.address}
                      </p>
                      <button 
                        onClick={() => openEditModal(p)}
                        className="mt-2 w-full text-[10px] text-emerald-600 font-bold uppercase tracking-wider hover:underline"
                      >
                        Editar Cadastro
                      </button>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            ))}
          </MapContainer>

          {/* Map Controls Floating */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000]">
            <button 
              onClick={() => setZoom(z => Math.min(z + 1, 18))}
              className="bg-white w-10 h-10 rounded-lg shadow-md border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-50 font-bold text-xl"
            >
              +
            </button>
            <button 
              onClick={() => setZoom(z => Math.max(z - 1, 3))}
              className="bg-white w-10 h-10 rounded-lg shadow-md border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-50 font-bold text-xl"
            >
              -
            </button>
            <button 
              onClick={() => {
                setShowAllInSidebar(true);
                setFitTrigger(prev => prev + 1);
                addLog("Ajustando mapa para mostrar todos os colaboradores.", "info");
              }}
              className="bg-white w-10 h-10 rounded-lg shadow-md border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-50"
              title="Ver todos no mapa"
            >
              <Maximize size={20} />
            </button>
          </div>
        </div>
      </main>

      {/* Registration/Edit Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4">
            <div 
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <div
              className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                <h2 className="text-xl font-bold text-stone-800">
                  {editingProviderId ? "Editar Colaborador" : "Novo Colaborador"}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-stone-400 hover:text-stone-600 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleRegister} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-500 uppercase">Nome</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={newProvider.name}
                      onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-500 uppercase">Tipo</label>
                    <select
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={newProvider.type}
                      onChange={(e) => setNewProvider({ ...newProvider, type: e.target.value })}
                    >
                      <option value="F">Pessoa Física (F)</option>
                      <option value="J">Pessoa Jurídica (J)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-500 uppercase">CPF/CNPJ</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={newProvider.document}
                      onChange={(e) => setNewProvider({ ...newProvider, document: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-500 uppercase">Descrição</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={newProvider.service}
                      onChange={(e) => setNewProvider({ ...newProvider, service: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-500 uppercase">Contato</label>
                  <textarea
                    rows={3}
                    placeholder="Ex: Nome - email@exemplo.com - (00) 0000-0000"
                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                    value={newProvider.contact}
                    onChange={(e) => setNewProvider({ ...newProvider, contact: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-500 uppercase">Status</label>
                    <select
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={newProvider.status}
                      onChange={(e) => setNewProvider({ ...newProvider, status: e.target.value })}
                    >
                      <option value="Ativo">Ativo</option>
                      <option value="Inativo">Inativo</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-500 uppercase flex items-center gap-1">
                      Nota (0 a 5) <Star size={12} className="text-amber-500" fill="currentColor" />
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      placeholder="Avaliação do colaborador"
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none font-bold text-amber-600"
                      value={newProvider.rating}
                      onChange={(e) => setNewProvider({ ...newProvider, rating: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-500 uppercase">Endereço</label>
                  <input
                    required
                    type="text"
                    placeholder="Rua, Número, Cidade, Estado"
                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={newProvider.address}
                    onChange={(e) => setNewProvider({ ...newProvider, address: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-500 uppercase">Latitude</label>
                    <input
                      required
                      type="number"
                      step="any"
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={newProvider.latitude}
                      onChange={(e) => setNewProvider({ ...newProvider, latitude: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-500 uppercase">Longitude</label>
                    <input
                      required
                      type="number"
                      step="any"
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={newProvider.longitude}
                      onChange={(e) => setNewProvider({ ...newProvider, longitude: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-stone-500 uppercase">Raio (km)</label>
                    <input
                      required
                      type="number"
                      min="1"
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={newProvider.radius}
                      onChange={(e) => setNewProvider({ ...newProvider, radius: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="pt-4">
                  {/* Botão de Salvar no Modal - bg-emerald-600 */}
                  <button
                    type="submit"
                    disabled={isRegistering}
                    className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isRegistering ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Processando...
                      </>
                    ) : (
                      editingProviderId ? "Atualizar Cadastro" : "Salvar Colaborador"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      {/* Global Table Modal */}
      {isTableOpen && (
        <div className="fixed inset-0 z-[1002] flex items-center justify-center p-4">
          <div 
            onClick={() => setIsTableOpen(false)}
            className="absolute inset-0 bg-stone-900/80 backdrop-blur-md"
          />
          <div className="relative bg-white w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-stone-800">Tabela Geral de Prestadores</h2>
                <div className="flex items-center gap-4 mt-2">
                  <p className="text-sm text-stone-500">Total de {allProviders.length} registros.</p>
                  <div className="relative flex-1 max-w-md">
                    <input 
                      type="text"
                      placeholder="Filtrar por nome, serviço ou endereço..."
                      className="w-full pl-9 pr-4 py-1.5 bg-white border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                  </div>
                  <button
                    onClick={retryAllFailedGeocoding}
                    disabled={isRetryingAll}
                    className="flex items-center gap-2 bg-amber-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {isRetryingAll ? <Loader2 className="animate-spin" size={14} /> : <Navigation size={14} />}
                    {isRetryingAll ? "Localizando..." : `Localizar Pendentes (${allProviders.filter(p => !p.latitude || isNaN(p.latitude) || p.latitude === 0).length})`}
                  </button>
                </div>
              </div>
              <button onClick={() => setIsTableOpen(false)} className="text-stone-400 hover:text-stone-600 transition-colors ml-4">
                <X size={32} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {isRetryingAll && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col gap-3 animate-pulse">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-amber-800 font-bold">
                      <Loader2 className="animate-spin" size={18} />
                      Processando Localizações...
                    </div>
                    <span className="text-amber-700 font-mono text-sm">
                      {retryProgress.current} de {retryProgress.total} ({Math.round((retryProgress.current / retryProgress.total) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-amber-200 rounded-full h-2.5">
                    <div 
                      className="bg-amber-600 h-2.5 rounded-full transition-all duration-500" 
                      style={{ width: `${(retryProgress.current / retryProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-amber-600 italic">
                    Por favor, mantenha esta janela aberta. Estamos respeitando o limite de velocidade do servidor de mapas.
                  </p>
                </div>
              )}
              
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b-2 border-stone-200">
                    <th 
                      className="py-3 px-4 text-xs font-bold text-stone-500 uppercase cursor-pointer hover:text-emerald-600 transition-colors"
                      onClick={() => setSortBy(sortBy === 'name' ? null : 'name')}
                    >
                      <div className="flex items-center gap-1">
                        Nome
                        {sortBy === 'name' && <ArrowUpDown size={12} />}
                      </div>
                    </th>
                    <th 
                      className="py-3 px-4 text-xs font-bold text-stone-500 uppercase cursor-pointer hover:text-emerald-600 transition-colors"
                      onClick={() => setSortBy(sortBy === 'rating-desc' ? 'rating-asc' : 'rating-desc')}
                    >
                      <div className="flex items-center gap-1">
                        Nota
                        {(sortBy === 'rating-desc' || sortBy === 'rating-asc') && <ArrowUpDown size={12} />}
                      </div>
                    </th>
                    <th className="py-3 px-4 text-xs font-bold text-stone-500 uppercase">Serviço</th>
                    <th className="py-3 px-4 text-xs font-bold text-stone-500 uppercase">Endereço</th>
                    <th className="py-3 px-4 text-xs font-bold text-stone-500 uppercase">Raio</th>
                    <th className="py-3 px-4 text-xs font-bold text-stone-500 uppercase">Status</th>
                    <th 
                      className="py-3 px-4 text-xs font-bold text-stone-500 uppercase cursor-pointer hover:text-emerald-600 transition-colors"
                      onClick={() => setSortBy(sortBy === 'distance' ? null : 'distance')}
                    >
                      <div className="flex items-center gap-1">
                        KM
                        {sortBy === 'distance' && <ArrowUpDown size={12} />}
                      </div>
                    </th>
                    <th className="py-3 px-4 text-xs font-bold text-stone-500 uppercase text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {allProviders.filter(p => 
                    p.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
                    p.service.toLowerCase().includes(tableSearch.toLowerCase()) ||
                    p.address.toLowerCase().includes(tableSearch.toLowerCase())
                  ).length > 0 ? (
                    allProviders
                      .filter(p => 
                        p.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
                        p.service.toLowerCase().includes(tableSearch.toLowerCase()) ||
                        p.address.toLowerCase().includes(tableSearch.toLowerCase())
                      )
                      .sort((a, b) => {
                        if (sortBy === 'distance') {
                          const distA = calculateDistance(mapCenter[0], mapCenter[1], a.latitude, a.longitude);
                          const distB = calculateDistance(mapCenter[0], mapCenter[1], b.latitude, b.longitude);
                          return distA - distB;
                        }
                        if (sortBy === 'rating-desc') return (b.rating || 0) - (a.rating || 0);
                        if (sortBy === 'rating-asc') return (a.rating || 0) - (b.rating || 0);
                        if (sortBy === 'name') return a.name.localeCompare(b.name);
                        return 0;
                      })
                      .map((p) => (
                      <tr key={p.id} className={`border-b border-stone-100 hover:bg-stone-50 transition-colors group ${(!p.latitude || isNaN(p.latitude) || p.latitude === 0) ? 'bg-red-50/50' : ''}`}>
                        <td className="py-3 px-4">
                          <div className="font-bold text-stone-800 flex items-center gap-2">
                            {p.name}
                            {(!p.latitude || isNaN(p.latitude) || p.latitude === 0) && (
                              <span title="Sem localização (Erro na geocodificação)" className="text-red-500"><AlertCircle size={14} /></span>
                            )}
                          </div>
                          <div className="text-[10px] text-stone-400">{p.type === 'J' ? 'PJ' : 'PF'} • {p.document || 'Sem documento'}</div>
                        </td>
                        <td className="py-3 px-4">
                          {p.rating !== undefined ? (
                            <div className="flex items-center gap-1 text-amber-600 font-bold text-sm">
                              <Star size={14} fill="currentColor" />
                              {p.rating.toFixed(1)}
                            </div>
                          ) : (
                            <span className="text-stone-300 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-stone-600">{p.service}</td>
                        <td className="py-3 px-4 text-xs text-stone-500 max-w-xs truncate">{p.address}</td>
                        <td className="py-3 px-4 text-sm font-medium">{p.radius}km</td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.status === 'Ativo' ? 'bg-blue-100 text-blue-700' : 'bg-stone-200 text-stone-600'}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-bold">
                            {calculateDistance(mapCenter[0], mapCenter[1], p.latitude, p.longitude).toFixed(1)} km
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {(!p.latitude || isNaN(p.latitude) || p.latitude === 0) && (
                              <button 
                                onClick={() => retryGeocoding(p)}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"
                                title="Tentar Localizar Novamente"
                              >
                                <Navigation size={16} />
                              </button>
                            )}
                            <button 
                              onClick={() => {
                                if (!p.latitude || isNaN(p.latitude) || p.latitude === 0) {
                                  alert("Este prestador não possui coordenadas válidas. Tente localizar primeiro.");
                                  return;
                                }
                                setMapCenter([p.latitude, p.longitude]);
                                setZoom(15);
                                setIsTableOpen(false);
                              }}
                              className={`p-1.5 rounded-lg ${(!p.latitude || isNaN(p.latitude) || p.latitude === 0) ? 'text-stone-300 cursor-not-allowed' : 'text-emerald-600 hover:bg-emerald-50'}`}
                              title="Ver no Mapa"
                            >
                              <MapPin size={16} />
                            </button>
                            <button 
                              onClick={() => openEditModal(p)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Editar"
                            >
                              <Pencil size={16} />
                            </button>
                            <button 
                              onClick={() => deleteProvider(p.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-stone-400">
                        Nenhum prestador encontrado com este filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-6 bg-stone-50 border-t border-stone-100 flex justify-between items-center">
              <div className="flex gap-4 items-center">
                <button 
                  onClick={clearDatabase}
                  className="text-xs text-red-600 font-bold hover:underline flex items-center gap-1"
                >
                  <X size={14} /> Limpar Banco de Dados
                </button>
                <div className="text-xs text-stone-500">
                  Registros em <span className="text-red-600 font-bold">vermelho</span> falharam na localização.
                </div>
              </div>
              <button 
                onClick={() => setIsTableOpen(false)}
                className="bg-stone-800 text-white px-6 py-2 rounded-xl font-bold hover:bg-black transition-colors"
              >
                Fechar Tabela
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Confirmação de Exclusão */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="bg-red-50 p-2 rounded-full">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-lg font-bold">Confirmar Exclusão</h3>
            </div>
            <p className="text-stone-600 mb-6">
              Tem certeza que deseja excluir este colaborador? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 px-4 py-2 rounded-xl border border-stone-200 font-bold text-stone-600 hover:bg-stone-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
