// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';
import { CallZomeRequest } from '@holochain/client';

contextBridge.exposeInMainWorld('__HC_ZOME_CALL_SIGNER__', {
  signZomeCall: (zomeCall: CallZomeRequest) =>
    ipcRenderer.invoke('sign-zome-call', zomeCall),
});

/** The compose-time adversary's model — epistemic-happ open-work 6.10.
 *
 * EXPOSED UNDER ITS OWN NAMESPACE rather than added to the zome-call signer,
 * because they are unrelated capabilities and a renderer that can sign zome
 * calls should not acquire a download manager by accident.
 *
 * THE RENDERER CANNOT REACH THE WEIGHTS OR THE NETWORK THROUGH THIS. It can
 * ask the status, ask for the download to start or stop, and ask for the
 * server to come up; every path and URL is pinned in `kangaroo.config.ts` on
 * the main side. That matters because the whole point of carrying a model is
 * that the author's drafts stay on the machine — a renderer that could name
 * the URL could name a different one.
 *
 * `onProgress` returns its own unsubscribe, so a screen that goes away stops
 * listening rather than leaking a handler per visit. */
contextBridge.exposeInMainWorld('__EPISTEMIC_MODEL__', {
  status: () => ipcRenderer.invoke('model-status'),
  download: () => ipcRenderer.invoke('model-download'),
  cancel: () => ipcRenderer.invoke('model-cancel'),
  serve: () => ipcRenderer.invoke('model-serve'),
  onProgress: (listener: (status: unknown) => void) => {
    const wrapped = (_event: unknown, status: unknown) => listener(status);
    ipcRenderer.on('model-progress', wrapped);
    return () => ipcRenderer.removeListener('model-progress', wrapped);
  },
});
