const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

// Importar o servidor Express (se estiver usando CommonJS no servidor)
// Como o projeto é ESM, vamos precisar rodar o servidor como um processo filho
// ou ajustar o Electron para carregar o servidor.
const { fork } = require('child_process');

let serverProcess;
let mainWindow;

const http = require('http');

function checkServerReady(callback) {
  const req = http.get('http://localhost:3000/api/health', (res) => {
    if (res.statusCode === 200) {
      callback();
    } else {
      console.log('Servidor respondendo mas não pronto, tentando novamente...');
      setTimeout(() => checkServerReady(callback), 1000);
    }
  });

  req.on('error', (err) => {
    console.log('Aguardando servidor subir...');
    setTimeout(() => checkServerReady(callback), 1000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "GeoService Locator",
  });

  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, 'dist', 'index.html')}`;

  console.log(`Carregando URL: ${startUrl}`);
  
  if (isDev) {
    checkServerReady(() => {
      if (mainWindow) {
        mainWindow.loadURL(startUrl);
        mainWindow.once('ready-to-show', () => mainWindow.show());
      }
    });
  } else {
    mainWindow.loadURL(startUrl);
    mainWindow.once('ready-to-show', () => mainWindow.show());
  }

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  const serverPath = path.join(__dirname, 'server.ts');
  
  console.log('Iniciando servidor Express...');
  
  // Iniciamos o servidor. No Electron, é melhor usar o binário do tsx diretamente
  // ou rodar via shell para garantir que o ambiente esteja correto.
  const { spawn } = require('child_process');
  
  if (isDev) {
    // Tenta rodar usando npx para garantir que o tsx seja encontrado
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    serverProcess = spawn(npx, ['tsx', serverPath], {
      env: { ...process.env, NODE_ENV: 'development', PORT: '3000' },
      shell: true
    });
  } else {
    serverProcess = spawn('node', [serverPath], {
      env: { ...process.env, NODE_ENV: 'production', PORT: '3000' }
    });
  }

  // Encaminha os logs do servidor para o console do Electron
  serverProcess.stdout.on('data', (data) => console.log(`[Server]: ${data}`));
  serverProcess.stderr.on('data', (data) => console.error(`[Server Error]: ${data}`));

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Garantir que o processo do servidor morra quando o Electron fechar
app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
