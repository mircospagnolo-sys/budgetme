/* BudgetMe — sync.js
   Sincronizzazione con Firebase Firestore
   I dati vengono cifrati PRIMA di lasciare il dispositivo */

import { encrypt, decrypt, generateSalt, hashPassword, verifyPassword } from './crypto.js';
import { exportAllData, importAllData } from './db.js';
import { toast } from './utils.js';

// ── STATO SINCRONIZZAZIONE ─────────────────────────────────────────────────
let _db      = null;  // Firestore instance
let _auth    = null;  // Firebase Auth instance
let _user    = null;  // Utente corrente
let _encPwd  = null;  // Password di cifratura (solo in memoria, mai salvata)
let _syncTimer = null;

export const syncState = {
  isLoggedIn:  false,
  isEncReady:  false,
  lastSync:    null,
  syncing:     false,
  userId:      null,
};

// ── INIT FIREBASE ───────────────────────────────────────────────────────────
export function initFirebase(firebaseApp, firestoreDb, firebaseAuth) {
  _db   = firestoreDb;
  _auth = firebaseAuth;

  // Ascolta cambio stato autenticazione
  _auth.onAuthStateChanged(async (user) => {
    if (user) {
      _user = user;
      syncState.isLoggedIn = true;
      syncState.userId = user.uid;
      document.dispatchEvent(new CustomEvent('auth:loggedin', { detail: user }));
    } else {
      _user = null;
      _encPwd = null;
      syncState.isLoggedIn  = false;
      syncState.isEncReady  = false;
      syncState.userId = null;
      document.dispatchEvent(new CustomEvent('auth:loggedout'));
    }
    updateSyncUI();
  });
}

// ── AUTENTICAZIONE ──────────────────────────────────────────────────────────
export async function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await _auth.signInWithPopup(provider);
  } catch(e) {
    console.error('Login error:', e);
    toast('Errore di accesso. Riprova.', 'error');
  }
}

export async function logout() {
  _encPwd = null;
  syncState.isEncReady = false;
  await _auth.signOut();
  toast('Disconnesso');
  updateSyncUI();
}

// ── GESTIONE PASSWORD DI CIFRATURA ──────────────────────────────────────────

// Controlla se l'utente ha già configurato la cifratura su Firestore
export async function hasEncryptionSetup() {
  if (!_user) return false;
  try {
    const doc = await _db.collection('users').doc(_user.uid)
      .collection('meta').doc('encryption').get();
    return doc.exists;
  } catch { return false; }
}

// Prima configurazione: imposta password e carica i dati locali cifrati
export async function setupEncryption(password) {
  if (!_user) throw new Error('Non autenticato');
  const salt        = generateSalt();
  const verifyToken = await hashPassword(password, salt);

  await _db.collection('users').doc(_user.uid)
    .collection('meta').doc('encryption')
    .set({ salt, verifyToken, createdAt: new Date().toISOString() });

  _encPwd = password;
  syncState.isEncReady = true;

  // Prima sync: carica i dati locali su Firestore
  await uploadData();
  toast('Sincronizzazione configurata', 'success');
  updateSyncUI();
}

// Login con password esistente
export async function unlockWithPassword(password) {
  if (!_user) throw new Error('Non autenticato');
  const meta = await _db.collection('users').doc(_user.uid)
    .collection('meta').doc('encryption').get();

  if (!meta.exists) throw new Error('Cifratura non configurata');
  const { salt, verifyToken } = meta.data();

  const ok = await verifyPassword(password, salt, verifyToken);
  if (!ok) throw new Error('Password errata');

  _encPwd = password;
  syncState.isEncReady = true;

  // Scarica e applica dati da Firestore
  await downloadData();
  toast('Sincronizzazione attiva', 'success');
  updateSyncUI();
  return true;
}

// ── UPLOAD (locale → Firestore) ─────────────────────────────────────────────
export async function uploadData() {
  if (!_user || !_encPwd) return;
  if (syncState.syncing) return;

  try {
    syncState.syncing = true;
    updateSyncUI();

    const meta = await _db.collection('users').doc(_user.uid)
      .collection('meta').doc('encryption').get();
    const { salt } = meta.data();

    const data      = await exportAllData();
    const encrypted = await encrypt(data, _encPwd, salt);

    await _db.collection('users').doc(_user.uid)
      .collection('data').doc('backup')
      .set({
        encrypted,
        updatedAt:   new Date().toISOString(),
        deviceId:    getDeviceId(),
        version:     data.version
      });

    syncState.lastSync = new Date();
    localStorage.setItem('lastSync', syncState.lastSync.toISOString());
    toast('✓ Dati sincronizzati', 'success');
  } catch(e) {
    console.error('Upload error:', e);
    toast('Errore sincronizzazione', 'error');
  } finally {
    syncState.syncing = false;
    updateSyncUI();
  }
}

// ── DOWNLOAD (Firestore → locale) ───────────────────────────────────────────
export async function downloadData() {
  if (!_user || !_encPwd) return;

  try {
    syncState.syncing = true;
    updateSyncUI();

    const meta = await _db.collection('users').doc(_user.uid)
      .collection('meta').doc('encryption').get();
    const { salt } = meta.data();

    const backup = await _db.collection('users').doc(_user.uid)
      .collection('data').doc('backup').get();

    if (!backup.exists) {
      // Nessun dato su Firestore — è il primo login, carica i dati locali
      await uploadData();
      return;
    }

    const { encrypted, deviceId } = backup.data();

    // Se il backup è stato fatto da questo stesso dispositivo, non sovrascrivere
    if (deviceId === getDeviceId()) {
      syncState.lastSync = new Date();
      return;
    }

    const data = await decrypt(encrypted, _encPwd, salt);
    await importAllData(data);
    syncState.lastSync = new Date();
    localStorage.setItem('lastSync', syncState.lastSync.toISOString());

    // Ricarica la pagina per aggiornare tutte le viste
    setTimeout(() => window.location.reload(), 800);
  } catch(e) {
    console.error('Download error:', e);
    toast('Errore scaricamento dati', 'error');
  } finally {
    syncState.syncing = false;
    updateSyncUI();
  }
}

// ── SYNC AUTOMATICA ─────────────────────────────────────────────────────────
// Chiama questa funzione ogni volta che modifichi dati nel DB
export function scheduleSync() {
  if (!syncState.isEncReady) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  // Aspetta 30 secondi dall'ultima modifica prima di sincronizzare
  _syncTimer = setTimeout(async () => {
    await uploadData();
  }, 30000);
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function getDeviceId() {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('deviceId', id);
  }
  return id;
}

function updateSyncUI() {
  const btn = document.getElementById('btn-sync-status');
  if (!btn) return;

  if (!syncState.isLoggedIn) {
    btn.textContent = '☁ Accedi';
    btn.style.color = 'var(--text-muted)';
  } else if (!syncState.isEncReady) {
    btn.textContent = '🔑 Sblocca';
    btn.style.color = 'var(--orange)';
  } else if (syncState.syncing) {
    btn.textContent = '↻ Sync...';
    btn.style.color = 'var(--blue)';
  } else {
    const t = syncState.lastSync
      ? syncState.lastSync.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      : '—';
    btn.textContent = `✓ ${t}`;
    btn.style.color = 'var(--green)';
  }
}

export { updateSyncUI };
