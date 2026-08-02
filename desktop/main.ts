import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import "./styles.css";

const editor = document.querySelector<HTMLTextAreaElement>("#source")!;
const fileName = document.querySelector<HTMLElement>("#file-name")!;
const documentState = document.querySelector<HTMLElement>("#document-state")!;
const status = document.querySelector<HTMLElement>("#status")!;
const openButton = document.querySelector<HTMLButtonElement>("#open-file")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save-file")!;
const saveAsButton = document.querySelector<HTMLButtonElement>("#save-as-file")!;

let currentPath: string | null = null;
let savedSource = "";

function basename(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path;
}

function setStatus(message: string, error = false): void {
  status.textContent = message;
  status.dataset.tone = error ? "error" : "neutral";
}

function isDirty(): boolean { return editor.value !== savedSource; }

function refreshDocumentState(): void {
  fileName.textContent = currentPath ? basename(currentPath) : "Untitled SIL/SUI document";
  documentState.textContent = isDirty() ? "Unsaved changes" : currentPath ? "Saved locally" : "Not saved";
}

async function loadFile(path: string): Promise<void> {
  try {
    const source = await invoke<string>("read_sil_file", { path });
    currentPath = path;
    editor.value = source;
    savedSource = source;
    refreshDocumentState();
    setStatus(`Opened ${basename(path)}.`);
    editor.focus();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function chooseAndOpen(): Promise<void> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "SIL/SUI contracts", extensions: ["sil", "sui"] }],
  });
  if (typeof selected === "string") await loadFile(selected);
}

async function saveTo(path: string): Promise<boolean> {
  try {
    await invoke("save_sil_file", { path, content: editor.value });
    currentPath = path;
    savedSource = editor.value;
    refreshDocumentState();
    setStatus(`Saved ${basename(path)}.`);
    return true;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    return false;
  }
}

async function saveAs(): Promise<void> {
  const target = await save({
    defaultPath: currentPath ?? "untitled.sil",
    filters: [{ name: "SIL contract", extensions: ["sil"] }, { name: "SUI specification", extensions: ["sui"] }],
  });
  if (typeof target === "string") await saveTo(target);
}

openButton.addEventListener("click", () => { void chooseAndOpen(); });
saveButton.addEventListener("click", () => { void (currentPath ? saveTo(currentPath) : saveAs()); });
saveAsButton.addEventListener("click", () => { void saveAs(); });
editor.addEventListener("input", refreshDocumentState);
window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void (event.shiftKey ? saveAs() : currentPath ? saveTo(currentPath) : saveAs());
  }
});

await listen<string[]>("sil-file-opened", (event) => {
  const path = event.payload[0];
  if (path) void loadFile(path);
});
const pending = await invoke<string[]>("take_pending_files");
if (pending[0]) await loadFile(pending[0]);
refreshDocumentState();
