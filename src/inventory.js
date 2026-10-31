import { db, set, dbRef, storage, storageRef, uploadBytes, getDownloadURL, onValue } from './firebase.js';

export function setupInventory() {
    const listEl = document.getElementById('inventoryList');
    const inputEl = document.getElementById('inventoryTextInput');
    const fileEl = document.getElementById('inventoryFileInput');
    const addBtn = document.getElementById('btnAddInventory');
    const statusEl = document.getElementById('inventoryUploadStatus');
    
    const lightbox = document.getElementById('inventoryLightbox');
    const lightboxImg = document.getElementById('lightboxImage');
    const closeLightboxBtn = document.getElementById('closeLightbox');
    
    // 1. Firebase Listener (Wrapped in a null check)
    if (listEl) {
        onValue(dbRef(db, 'inventory'), (snapshot) => {
            listEl.innerHTML = '';
            const items = snapshot.val() || {};
            
            // Sort by timestamp (oldest first)
            const sortedItems = Object.entries(items).sort((a, b) => a[1].timestamp - b[1].timestamp);

            sortedItems.forEach(([id, item]) => {
                const li = document.createElement('li');
                li.className = 'inventory-item'; // Pulls the #18181b background and green left-border from CSS
                
                // --- POPS DOM STRUCTURE FIX ---
                // Header (Type label and delete button)
                const header = document.createElement('div');
                header.className = 'inventory-item-header';
                // Force relative positioning on the header so the absolute button anchors to it, not the whole screen
                header.style.position = 'relative';
                
                let typeLabel = "Cargo";
                if (item.type === 'image') typeLabel = "Visual Data";
                if (item.type === 'audio') typeLabel = "Audio Log";

                header.innerHTML = `
                   <span style="font-family: 'Audiowide', docs-Audiowide, Arial, sans-serif; font-weight: 700; color: #2e7d32; font-size: 11px;">${typeLabel}</span>
                    <button class="inventory-delete-btn" data-id="${id}" title="Delete Item" style="position: absolute; top: 2px; right: 0px; font-size: 10px; background: #27272a; border: 1px solid #7f0000; color: #f87171; padding: 1px 6px; border-radius: 4px; cursor: pointer; z-index: 10; width: auto; height: 18px; line-height: 1;">✕</button>
                `;
                li.appendChild(header);

                // Body (The actual text/filename)
                const body = document.createElement('div');
                body.style.cssText = "white-space: pre-wrap; line-height: 1.5; color: #e4e4e7; font-size: 12px;";
                body.textContent = (item.type !== 'text') ? item.name.replace(/\.[^/.]+$/, "") : item.name;
                li.appendChild(body);
                // -------------------------------

                // Media attachment rendering
                if (item.type === 'image' && item.url) {
                    const img = document.createElement('img');
                    img.src = item.url;
                    img.className = 'inventory-image-thumb';
                    img.title = "Click to enlarge";
                    img.style.marginTop = "6px";
                    img.onclick = () => {
                        if (lightboxImg && lightbox) {
                            lightboxImg.src = item.url;
                            lightbox.style.display = 'flex';
                        }
                    };
                    li.appendChild(img);
                } 
                else if (item.type === 'audio' && item.url) {
                    const audio = document.createElement('audio');
                    audio.controls = true;
                    audio.src = item.url;
                    audio.className = 'inventory-audio';
                    // Force the audio player to fit the width of the row, scale down its height, and blend its colors (if the browser allows)
                    audio.style.cssText = "width: 100%; height: 28px; margin-top: 6px; outline: none; border-radius: 4px; opacity: 0.9;";
                    li.appendChild(audio);
                }

                listEl.appendChild(li);
            });

            // Attach delete listeners
            document.querySelectorAll('.inventory-delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const itemId = e.target.getAttribute('data-id');
                    set(dbRef(db, `inventory/${itemId}`), null);
                });
            });
            
            // Auto-scroll to bottom on new item
            listEl.scrollTop = listEl.scrollHeight;
        });
    }

    // 2. Add New Item Logic (Wrapped in a null check)
    if (addBtn && inputEl && fileEl && statusEl) {
        addBtn.addEventListener('click', async () => {
            const text = inputEl.value.trim();
            const file = fileEl.files[0];
            
            if (!text && !file) return; // Nothing to add
            
            addBtn.disabled = true;
            
            const newItemId = 'item_' + Date.now();
            let payload = {
                name: text || (file ? file.name : 'Unknown Item'),
                timestamp: Date.now(),
                type: 'text'
            };

            if (file) {
                statusEl.innerText = "Uploading file... ⏳";
                try {
                    // Upload to Firebase Storage
                    const sRef = storageRef(storage, `cargo/${Date.now()}_${file.name}`);
                    await uploadBytes(sRef, file);
                    const url = await getDownloadURL(sRef);
                    
                    payload.url = url;
                    if (file.type.startsWith('image/')) payload.type = 'image';
                    else if (file.type.startsWith('audio/')) payload.type = 'audio';
                    
                } catch (err) {
                    console.error("Cargo upload failed", err);
                    statusEl.innerText = "Upload failed ❌";
                    addBtn.disabled = false;
                    return;
                }
            }

            // Push to Realtime Database
            set(dbRef(db, `inventory/${newItemId}`), payload);
            
            // Reset inputs
            inputEl.value = '';
            fileEl.value = '';
            statusEl.innerText = "";
            addBtn.disabled = false;
        });
    }

    // 3. Lightbox Close Logic (Wrapped in null checks)
    if (closeLightboxBtn && lightbox && lightboxImg) {
        closeLightboxBtn.addEventListener('click', () => {
            lightbox.style.display = 'none';
            lightboxImg.src = '';
        });
        
        // Close lightbox if clicking the black background
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                lightbox.style.display = 'none';
                lightboxImg.src = '';
            }
        });
    }
}