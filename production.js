import { db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    onSnapshot,
    query,
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- AUTO-FILL DATES ON LOAD ---
const today = new Date().toISOString().slice(0, 10);
const soDateInput = document.getElementById('so-date');
const poDateInput = document.getElementById('po-date');
if(soDateInput) soDateInput.value = today;
if(poDateInput) poDateInput.value = today;

// --- POPULATE DROPDOWNS REAL-TIME ---

// 1. Clients (For Sales Orders)
onSnapshot(collection(db, "master_clients"), (snap) => {
    let opts = '<option value="">-- Select Client --</option>';
    snap.docs.forEach(doc => { const c = doc.data(); opts += `<option value="${c.name}">${c.name}</option>`; });
    const el = document.getElementById('so-client');
    if(el) el.innerHTML = opts;
});

// 2. Articles (For BOTH Forms)
onSnapshot(collection(db, "master_articles"), (snap) => {
    let opts = '<option value="">-- Select Article --</option>';
    snap.docs.forEach(doc => { const a = doc.data(); opts += `<option value="${a.code}">${a.name} [${a.code}]</option>`; });
    
    const elSO = document.getElementById('so-article');
    const elPO = document.getElementById('po-article');
    if(elSO) elSO.innerHTML = opts;
    if(elPO) elPO.innerHTML = opts;
});

// 3. Workers (For Production Jobs)
onSnapshot(collection(db, "master_workers"), (snap) => {
    let opts = '<option value="">-- Select Worker --</option>';
    snap.docs.forEach(doc => { const w = doc.data(); opts += `<option value="${w.name}">${w.name} - ${w.type || 'Worker'}</option>`; });
    const el = document.getElementById('po-worker');
    if(el) el.innerHTML = opts;
});

// 4. Sales Orders (To link to a Production Job)
onSnapshot(query(collection(db, "sales_orders"), orderBy("date", "desc")), (snap) => {
    let linkOpts = '<option value="None">Stock / No Linked Order</option>';
    snap.docs.forEach(doc => {
        const so = doc.data();
        linkOpts += `<option value="${so.orderNo}">${so.orderNo} - ${so.client}</option>`;
    });
    const linkDrop = document.getElementById('po-link');
    if(linkDrop) linkDrop.innerHTML = linkOpts;
});

// --- SAVE FUNCTIONS ---

// Save Sales Order
window.saveSalesOrder = async function() {
    const date = document.getElementById('so-date').value;
    const orderNo = document.getElementById('so-no').value;
    const client = document.getElementById('so-client').value;
    const article = document.getElementById('so-article').value;
    const qty = parseInt(document.getElementById('so-qty').value);
    const rate = parseFloat(document.getElementById('so-rate').value);

    if (!orderNo || !client || !article || isNaN(qty) || isNaN(rate)) {
        return alert("⚠️ Please fill out all Sales Order fields.");
    }

    const btn = event.target;
    btn.innerText = "Saving..."; btn.disabled = true;

    try {
        await addDoc(collection(db, "sales_orders"), { 
            date, orderNo, client, article, qty, rate, status: 'Pending' 
        });
        
        alert("Sales Order Created!");
        
        // Clear form
        document.getElementById('so-no').value = '';
        document.getElementById('so-qty').value = '';
        document.getElementById('so-rate').value = '';
        closeAllModals(); // Closes popup
        
    } catch (e) {
        console.error("Save Error:", e);
        alert("Failed to save Sales Order.");
    } finally {
        btn.innerText = "Create Sales Order"; btn.disabled = false;
    }
};

// Save Production Order
window.saveProductionOrder = async function() {
    const date = document.getElementById('po-date').value;
    const linkedSO = document.getElementById('po-link').value;
    const article = document.getElementById('po-article').value;
    const worker = document.getElementById('po-worker').value;
    const qty = parseInt(document.getElementById('po-qty').value);

    if (!article || !worker || isNaN(qty)) {
        return alert("⚠️ Please select an Article, Worker, and Quantity.");
    }

    const btn = event.target;
    btn.innerText = "Assigning..."; btn.disabled = true;

    try {
        await addDoc(collection(db, "production_orders"), { 
            date, linkedSO, article, worker, qty, status: 'In Progress' 
        });
        
        alert("Job Assigned to Worker!");
        
        // Clear form
        document.getElementById('po-qty').value = '';
        closeAllModals(); // Closes popup
        
    } catch (e) {
        console.error("Save Error:", e);
        alert("Failed to assign Job Work.");
    } finally {
        btn.innerText = "Assign to Worker"; btn.disabled = false;
    }
};