import path from "path";
import os from "os";
import fs from "fs";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";

const composition = process.argv[2];
if (!composition) {
  console.error("Uso: node scripts/transcribe.mjs <NomeDaComposition>");
  process.exit(1);
}

// Instalado fora do projeto: o caminho do ScaultOS tem espaço/acento
// ("Área de Trabalho"), e o instalador do whisper.cpp no Windows sempre
// baixa o zip em process.cwd() e chama Expand-Archive sem escapar o
// argumento — quebra em caminhos com espaço. Fica em ~/.whisper-cpp,
// reutilizável entre vídeos e sessões.
const to = path.join(os.homedir(), ".whisper-cpp");
const projectDir = process.cwd();
const wavPath = path.join(projectDir, "src", composition, "audio.wav");
// Em public/ (não em src/) para que o Remotion consiga fazer fetch via
// staticFile() em tempo de execução; subpasta por composition evita
// colisão entre vídeos diferentes.
const outPath = path.join(projectDir, "public", composition, "captions.json");
process.chdir(os.homedir());

if (!fs.existsSync(wavPath)) {
  console.error(`Arquivo não encontrado: ${wavPath}`);
  process.exit(1);
}

await installWhisperCpp({ to, version: "1.5.5" });
await downloadWhisperModel({ model: "medium", folder: to });

const whisperCppOutput = await transcribe({
  model: "medium",
  whisperPath: to,
  whisperCppVersion: "1.5.5",
  inputPath: wavPath,
  tokenLevelTimestamps: true,
  splitOnWord: true,
  language: "Portuguese",
});

const { captions } = toCaptions({ whisperCppOutput });

fs.writeFileSync(outPath, JSON.stringify(captions, null, 2));
console.log(`Legendas salvas em ${outPath}`);
