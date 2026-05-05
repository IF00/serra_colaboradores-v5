export interface Provider {
  id: number;
  name: string;
  type: "F" | "J";
  document: string;
  contact: string;
  service: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number;
  status: "Ativo" | "Inativo";
  rating: number;
}
