import { db } from './firebase-config.js';
import { 
   collection, 
    addDoc, 
    serverTimestamp,
    doc,
    updateDoc,
    getDocs,
    getDoc,
    query,
    where 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

window.saveArticle = async function () {
    const code = document.getElementById('art-code').value;
    const name = document.getElementById('art-name').value;
    const category = document.getElementById('art-category').value;
    const cost = parseFloat(document.getElementById('art-cost').value);
    const price = parseFloat(document.getElementById('art-price').value);

    if (!code || !name || isNaN(cost) || isNaN(price)) return alert("Fill all article fields");

    await addDoc(collection(db, "master_articles"), { code, name, category, cost, price });
    alert("Article Saved!");
    // Clear form
    document.getElementById('art-code').value = ''; document.getElementById('art-name').value = ''; document.getElementById('art-cost').value = ''; document.getElementById('art-price').value = '';
};

window.saveWorker = async function () {
    const id = document.getElementById('wrk-id').value;
    const name = document.getElementById('wrk-name').value;
    const type = document.getElementById('wrk-type').value;
    const rate = parseFloat(document.getElementById('wrk-rate').value);

    if (!id || !name || isNaN(rate)) return alert("Fill all worker fields");

    await addDoc(collection(db, "master_workers"), { id, name, type, rate });
    alert("Worker Saved!");
    // Clear form
    document.getElementById('wrk-id').value = ''; document.getElementById('wrk-name').value = ''; document.getElementById('wrk-rate').value = '';
};

window.saveClient = async function () {
    const id = document.getElementById('cli-id').value;
    const name = document.getElementById('cli-name').value;
    const contact = document.getElementById('cli-contact').value;

    if (!id || !name) return alert("Fill all client fields");

    await addDoc(collection(db, "master_clients"), { id, name, contact });
    alert("Client Saved!");
    // Clear form
    document.getElementById('cli-id').value = ''; document.getElementById('cli-name').value = ''; document.getElementById('cli-contact').value = '';
};
// 1. OPEN MANAGER & LOAD DATA
window.openManager = async function (type) {
    const body = document.getElementById('manager-body');
    const title = document.getElementById('manager-title');

    // 2. Open the modal
    openModal('manager-modal');
    
    // 3. Set loading state
    body.innerHTML = '<p style="padding: 20px; text-align: center;">Loading data from vault...</p>';
    // Configure settings based on what button was clicked
    let collectionName = '';
    let fields = [];

    if (type === 'articles') {
        collectionName = 'master_articles';
        title.innerText = '⚙️ Manage Articles';
        fields = [{ key: 'code', label: 'Article Code' }, { key: 'name', label: 'Article Name' },{key:'cost',label:'Cost'},{key:'price',label:'Price'}];
    } else if (type === 'workers') {
        collectionName = 'master_workers';
        title.innerText = '⚙️ Manage Workers';
        fields = [{ key: 'name', label: 'Worker Name' },{ key: 'rate', label: 'Piece Rate' }];
    } else if (type === 'clients') {
        collectionName = 'master_clients';
        title.innerText = '⚙️ Manage Clients';
        fields = [{ key: 'name', label: 'Client Name' }, { key: 'contact', label: 'Contact Info' }];
    }

    try {
        const querySnapshot = await getDocs(collection(db, collectionName));

        if (querySnapshot.empty) {
            body.innerHTML = '<p>No data found.</p>';
            return;
        }

        // Build the Table Header
        let html = `<table class="manager-table"><thead><tr>`;
        fields.forEach(f => html += `<th>${f.label}</th>`);
        html += `<th>Actions</th></tr></thead><tbody>`;

        // Build the Table Rows
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            html += `<tr id="row-${doc.id}">`;

            fields.forEach(f => {
                html += `<td>
                            <span class="val-${f.key}">${data[f.key] || ''}</span>
                            <input type="text" class="edit-${f.key} manager-input" value="${data[f.key] || ''}" style="display:none;">
                        </td>`;
            });

            // Action Buttons (Notice we pass the doc ID and collection name!)
            html += `<td>
                        <button class="action-btn edit-btn" onclick="toggleEdit('${doc.id}')">Edit</button>
                        <button class="action-btn save-btn" style="display: none !important;" onclick="saveEdit('${doc.id}', '${collectionName}', '${JSON.stringify(fields.map(f => f.key)).replace(/"/g, '&quot;')}')">Save</button>
                        <button class="action-btn del-btn" onclick="deleteRecord('${doc.id}', '${collectionName}')">Delete</button>
                    </td></tr>`;
        });

        html += `</tbody></table>`;
        body.innerHTML = html;

    } catch (error) {
        console.error("Error loading data:", error);
        body.innerHTML = '<p style="color:red;">Error loading data.</p>';
    }
};

// TOGGLE EDIT MODE
window.toggleEdit = function (id) {
    const row = document.getElementById(`row-${id}`);

    // 1. Hide the text, show the input boxes
    row.querySelectorAll('span[class^="val-"]').forEach(el => el.style.display = 'none');
    row.querySelectorAll('input[class^="edit-"]').forEach(el => el.style.display = 'inline-block');

    // 2. Hide "Edit" and show "Save" (Using setProperty to ensure it wins)
    row.querySelector('.edit-btn').style.setProperty('display', 'none', 'important');
    row.querySelector('.save-btn').style.setProperty('display', 'inline-block', 'important');
};

// 3. SAVE EDITS TO FIREBASE
window.saveEdit = async function (id, collectionName, fieldsJson) {
    const row = document.getElementById(`row-${id}`);
    const fields = JSON.parse(fieldsJson);
    let updatedData = {};

    // Grab the new values from the input boxes
    fields.forEach(key => {
        updatedData[key] = row.querySelector(`.edit-${key}`).value;
    });

    const btn = row.querySelector('.save-btn');
    btn.innerText = 'Saving...';

    try {
        await updateDoc(doc(db, collectionName, id), updatedData);

        // Update the text spans with the new data and switch back to view mode
        fields.forEach(key => {
            row.querySelector(`.val-${key}`).innerText = updatedData[key];
        });

        row.querySelectorAll('span[class^="val-"]').forEach(el => el.style.display = 'inline');
        row.querySelectorAll('input[class^="edit-"]').forEach(el => el.style.display = 'none');
        row.querySelector('.edit-btn').style.setProperty('display', 'inline-block', 'important');
        btn.style.setProperty('display', 'none', 'important');
        btn.innerText = 'Save';

    } catch (error) {
        console.error("Error updating:", error);
        alert("Failed to update record.");
        btn.innerText = 'Save';
    }
};

// 4. DELETE FROM FIREBASE
window.deleteRecord = async function (id, collectionName) {
    if (confirm("⚠️ Are you sure you want to permanently delete this record?")) {
        try {
            await deleteDoc(doc(db, collectionName, id));
            // Remove the row from the table instantly
            document.getElementById(`row-${id}`).remove();
        } catch (error) {
            console.error("Error deleting:", error);
            alert("Failed to delete record.");
        }
    }
};