import { db } from './firebase-config.js';
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, onSnapshot, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// Auto-fill today's dates
const today = new Date().toISOString().slice(0, 10);
document.querySelectorAll('input[type="date"]').forEach(el => el.value = today);
document.getElementById('ss-month').value = today.slice(0, 7);
document.getElementById('inv-date').value = today;
document.getElementById('rec-date').value = today;

// --- PULL MASTERS FOR DROPDOWNS ---
onSnapshot(collection(db, "master_workers"), (snap) => {
    let opts = '<option value="">-- Select Worker --</option>';
    snap.docs.forEach(doc => {
        const w = doc.data();
        // Notice the new data-rate attribute!
        opts += `<option value="${w.name}" data-rate="${w.rate || ''}">${w.name} - ${w.type}</option>`;
    });
    document.getElementById('wp-worker').innerHTML = opts;
});

onSnapshot(collection(db, "master_articles"), (snap) => {
    let opts = '<option value="">-- Select Article --</option>';
    snap.docs.forEach(doc => { const a = doc.data(); opts += `<option value="${a.code}">${a.name} [${a.code}]</option>`; });

    // Fills the Worker Payment dropdown
    document.getElementById('wp-article').innerHTML = opts;

    // ADD THIS LINE: Fills the Sales Invoice dropdown
    document.getElementById('inv-article').innerHTML = opts;
});

onSnapshot(collection(db, "master_clients"), (snap) => {
    let opts = '<option value="">-- Select Client --</option>';
    snap.docs.forEach(doc => { const c = doc.data(); opts += `<option value="${c.name}">${c.name}</option>`; });
    document.getElementById('rec-client').innerHTML = opts;
});

// --- PULL ACTIVE JOBS FOR WORKER LOG ---
onSnapshot(query(collection(db, "production_orders"), where("status", "==", "In Progress")), (snap) => {
    let opts = '<option value="">-- Select Active Job --</option>';
    
    snap.docs.forEach(doc => {
        const job = doc.data();
        // Label looks like: "Taufiq - red shirt [90] (40 units left)"
        const label = `${job.worker} - ${job.article} (${job.qty} units left)`;
        opts += `<option value="${doc.id}">${label}</option>`;
    });

    const jobDrop = document.getElementById('pay-worker-job');
    if (jobDrop) jobDrop.innerHTML = opts;
});

onSnapshot(collection(db, "sales_orders"), (snap) => {
    let opts = '<option value="">-- Select Linked Order --</option>';
    
    // Sort them so the newest orders appear at the top of the list
    const docs = snap.docs.reverse(); 
    
    // THE FIX: Filter out completed orders before looping
    docs
        .filter(doc => doc.data().status !== 'Completed') 
        .forEach(doc => { 
            const so = doc.data(); 
            
            // Grab the Order Number (or use the Firebase ID if there isn't one)
            const orderNo = so.orderNo || so.code || doc.id; 
            
            // Build a nice readable label for the dropdown: "SO-101 (Sarah) - 50 Units"
            const label = `${orderNo} (${so.client || 'Unknown'}) - ${so.qty || 0} Units`;
            
            opts += `<option value="${orderNo}">${label}</option>`; 
        });
    
    const soDropdown = document.getElementById('inv-so');
    if (soDropdown) {
        soDropdown.innerHTML = opts;
    }
});
// Note: You can reuse the existing 'wp-article' snapshot to also fill 'inv-article' by adding:
// document.getElementById('inv-article').innerHTML = opts; inside the master_articles snapshot.

window.saveInvoice = async function () {
    const date = document.getElementById('inv-date').value;
    const invoiceNo = document.getElementById('inv-no').value;
    const linkedSO = document.getElementById('inv-so').value;

    const articleSelect = document.getElementById('inv-article');
    const articleCode = articleSelect.value;
    const articleFullName = articleSelect.options[articleSelect.selectedIndex].text;

    const qty = parseInt(document.getElementById('inv-qty').value);
    const rate = parseFloat(document.getElementById('inv-rate').value);

    if (!invoiceNo || !linkedSO || isNaN(qty) || isNaN(rate)) {
        return alert("⚠️ Please select a Linked Sales Order and fill all required fields!");
    }

    const totalAmount = qty * rate;
    const formatMoney = (amt) => '₹' + amt.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    // 1. Save to Database
    await addDoc(collection(db, "erp_invoices"), { date, invoiceNo, linkedSO, article: articleCode, qty, rate, total: totalAmount });
    // ==========================================
        // NEW LOGIC: DEPLETE LINKED SALES ORDER
        // ==========================================
        if (linkedSO && linkedSO !== "") {
            // 1. Find the specific Sales Order in the database
            const soQuery = query(collection(db, "sales_orders"), where("orderNo", "==", linkedSO));
            const soSnap = await getDocs(soQuery);
            
            if (!soSnap.empty) {
                const soDoc = soSnap.docs[0]; // Get the first matching order
                const soData = soDoc.data();
                
                // 2. Calculate the remaining quantity
                const currentQty = soData.qty || 0;
                const invoicedQty = parseInt(qty); // The qty you just typed into the invoice form
                const newQty = currentQty - invoicedQty;
                
                // 3. Update the database
                if (newQty <= 0) {
                    // Order is fully delivered! Set to 0 and mark Completed.
                    await updateDoc(doc(db, "sales_orders", soDoc.id), {
                        qty: 0,
                        status: 'Completed'
                    });
                } else {
                    // Order is partially delivered. Just update the new remaining quantity.
                    await updateDoc(doc(db, "sales_orders", soDoc.id), {
                        qty: newQty
                    });
                }
            }
        }
        // ==========================================
    // 2. Secure Native PDF Generation & Emailing
    if (confirm("Invoice Saved! Generate PDF and send to Email?")) {

        // 🔴 THE FIX: Safely find the button by its onclick attribute
        const btn = document.querySelector('button[onclick="saveInvoice()"]');
        let originalText = "Record Invoice";

        if (btn) {
            originalText = btn.innerText;
            btn.innerText = "Generating & Emailing...";
            btn.disabled = true;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Header
            doc.setFontSize(22);
            doc.text("MUGGUN BOUTIQUE", 105, 20, { align: "center" });
            doc.setFontSize(12);
            doc.setTextColor(100);
            doc.text("Tax Invoice / Bill of Supply", 105, 28, { align: "center" });

            // Meta Data
            doc.setTextColor(0);
            doc.setFontSize(10);
            doc.text(`Invoice No: ${invoiceNo}`, 14, 45);
            doc.text(`Date: ${new Date(date).toLocaleDateString('en-IN')}`, 14, 52);
            doc.text(`Linked Order: ${linkedSO || 'N/A'}`, 196, 45, { align: "right" });

            // The Items Table
            doc.autoTable({
                startY: 60,
                head: [['Article Description', 'Quantity', 'Rate', 'Total']],
                body: [[articleFullName, `${qty} Units`, formatMoney(rate), formatMoney(totalAmount)]],
                theme: 'striped',
                headStyles: { fillColor: [46, 125, 50] },
                foot: [['', '', 'Grand Total', formatMoney(totalAmount)]],
                footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
            });

            // Footer Signature
            const finalY = doc.lastAutoTable.finalY || 80;
            doc.text("_________________________", 196, finalY + 40, { align: "right" });
            doc.text("Authorized Signatory", 196, finalY + 47, { align: "right" });

            // 1. Download locally
            doc.save(`${invoiceNo}_Muggun_Boutique.pdf`);

            // 2. Convert to text
            const pdfBase64 = doc.output('datauristring');

            const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwu1WV6_fx8xFwKAWLdMajONVZK8fTFNa-NEksebgoVUnQOFS2Z06Fhu2PZLbC_L4imAw/exec";

            // 4. Send to Post Office
            await fetch(SCRIPT_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({
                    pdfData: pdfBase64,
                    fileName: `${invoiceNo}_Muggun_Boutique.pdf`
                })
            });

            alert("Invoice generated and emailed successfully!");
        } catch (error) {
            console.error("Email error:", error);
            alert("PDF generated, but email failed. Check console.");
        } finally {
            // Reset button state
            if (btn) {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        }
    }

    // 3. Clear the form
    document.querySelectorAll('#inv-no, #inv-so, #inv-qty, #inv-rate').forEach(el => el.value = '');
    articleSelect.selectedIndex = 0;
};

window.saveReceipt = async function () {
    const date = document.getElementById('rec-date').value;
    const client = document.getElementById('rec-client').value;
    const invoiceNo = document.getElementById('rec-inv').value || 'Advance / Unlinked';
    const amount = parseFloat(document.getElementById('rec-amount').value);
    const mode = document.getElementById('rec-mode').value;
    const fileInput = document.getElementById('rec-receipt');

    if (!client || isNaN(amount)) return alert("Fill required receipt fields.");

    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        let receiptUrl = null;

        // Compress and encode the image if a screenshot is attached
        if (fileInput.files.length > 0) {
            receiptUrl = await compressImage(fileInput.files[0]);
        }

        // Save to Database (Notice we completely removed the PDF code)
        await addDoc(collection(db, "erp_receipts"), {
            date, client, invoiceNo, amount, mode, receiptUrl
        });

        alert("Payment Receipt Logged!");

        // Clear the form
        document.querySelectorAll('#rec-inv, #rec-amount').forEach(el => el.value = '');
        fileInput.value = '';
        document.getElementById('rec-file-name').innerText = "📁 Click to select proof...";
        document.getElementById('rec-file-name').style.color = "#777";

    } catch (error) {
        console.error("Save Error:", error);
        alert("Error saving data. Check console.");
    } finally {
        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
};
// --- FREE BASE64 IMAGE COMPRESSOR ---
const compressImage = (file) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600; // Shrinks it so it easily fits in the database
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Converts to a compressed text string (JPEG, 70% quality)
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
    });
};
// --- SAVE FUNCTIONS ---
window.savePurchase = async function () {
    const date = document.getElementById('pur-date').value;
    const supplier = document.getElementById('pur-supplier').value;
    const type = document.getElementById('pur-type').value;
    const qty = parseFloat(document.getElementById('pur-qty').value);
    const rate = parseFloat(document.getElementById('pur-rate').value);
    const fileInput = document.getElementById('pur-receipt');

    if (!supplier || isNaN(qty) || isNaN(rate)) return alert("Fill all required purchase fields.");

    const btn = event.target;
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        let receiptUrl = null;

        // If a file was uploaded, convert it to a compressed text string
        if (fileInput.files.length > 0) {
            receiptUrl = await compressImage(fileInput.files[0]);
        }

        await addDoc(collection(db, "erp_purchases"), {
            date, supplier, type, qty, rate, total: qty * rate, receiptUrl
        });

        alert("Purchase Logged!");

        // Clear form
        document.getElementById('pur-supplier').value = '';
        document.getElementById('pur-qty').value = '';
        document.getElementById('pur-rate').value = '';
        document.getElementById('pur-file-name').innerText = "📁 Click to select receipt...";
        document.getElementById('pur-file-name').style.color = "#777";
        fileInput.value = '';
    } catch (error) {
        console.error("Save Error:", error);
        alert("Error saving data. Check console.");
    } finally {
        btn.innerText = "Record Purchase";
        btn.disabled = false;
    }
};
window.saveExpense = async function () {
    const date = document.getElementById('exp-date').value;
    const head = document.getElementById('exp-head').value;
    const desc = document.getElementById('exp-desc').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const fileInput = document.getElementById('exp-receipt');

    if (!desc || isNaN(amount)) return alert("Fill all required expense fields.");

    const btn = event.target;
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        let receiptUrl = null;

        // Compress and encode the image if one is attached
        if (fileInput.files.length > 0) {
            receiptUrl = await compressImage(fileInput.files[0]);
        }

        // Save to database
        await addDoc(collection(db, "erp_expenses"), {
            date, head, desc, amount, receiptUrl
        });

        alert("Expense Logged!");

        // Clear the form
        document.getElementById('exp-desc').value = '';
        document.getElementById('exp-amount').value = '';
        fileInput.value = '';
        document.getElementById('exp-file-name').innerText = "📁 Click to select bill...";
        document.getElementById('exp-file-name').style.color = "#777";

    } catch (error) {
        console.error("Save Error:", error);
        alert("Error saving data. Check console.");
    } finally {
        btn.innerText = "Record Expense";
        btn.disabled = false;
    }
};

window.saveWorkerPayment = async function () {
    const date = document.getElementById('wp-date').value;
    const worker = document.getElementById('wp-worker').value;
    const article = document.getElementById('wp-article').value;
    const qty = parseInt(document.getElementById('wp-qty').value);
    const rate = parseFloat(document.getElementById('wp-rate').value);
    const fileInput = document.getElementById('wp-receipt');

    if (!worker || !article || isNaN(qty) || isNaN(rate)) return alert("Fill all worker payment fields.");

    const btn = event.target;
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        let receiptUrl = null;

        // Compress and encode the image if one is attached
        if (fileInput.files.length > 0) {
            receiptUrl = await compressImage(fileInput.files[0]);
        }

        // Save to database
        await addDoc(collection(db, "erp_worker_payments"), {
            date, worker, article, qty, rate, total: qty * rate, receiptUrl
        });
        // ==========================================
        // DIAGNOSTIC VERSION: DEPLETE PRODUCTION JOB
        // ==========================================
        const linkedJobId = document.getElementById('pay-worker-job')?.value || "";
        const completedQty = parseInt(document.getElementById('wp-qty')?.value || 0);

        console.log("Attempting depletion. Job ID:", linkedJobId, "Qty:", completedQty);

        if (linkedJobId && linkedJobId !== "") {
            const jobRef = doc(db, "production_orders", linkedJobId);
            const jobSnap = await getDoc(jobRef); 

            if (jobSnap.exists()) {
                const jobData = jobSnap.data();
                const currentTargetQty = Number(jobData.qty || 0); // Force to number
                const newTargetQty = currentTargetQty - completedQty;

                console.log("Current Qty in DB:", currentTargetQty, "New Qty will be:", newTargetQty);

                if (newTargetQty <= 0) {
                    await updateDoc(jobRef, { qty: 0, status: 'Completed' });
                    console.log("Job marked as Completed.");
                } else {
                    await updateDoc(jobRef, { qty: newTargetQty });
                    console.log("Job quantity updated successfully.");
                }
            } else {
                console.error("COULD NOT FIND THE JOB IN DATABASE!");
            }
        }

        alert("Worker Payment Logged!");

        // Clear the form
        document.getElementById('wp-qty').value = '';
        document.getElementById('wp-rate').value = '';
        fileInput.value = '';
        document.getElementById('wp-file-name').innerText = "📁 Click to select proof...";
        document.getElementById('wp-file-name').style.color = "#777";

    } catch (error) {
        console.error("Save Error:", error);
        alert("Error saving data. Check console.");
    } finally {
        btn.innerText = "Log Worker Payout";
        btn.disabled = false;
    }
};

window.saveStaffSalary = async function () {
    const date = document.getElementById('ss-date').value;
    const name = document.getElementById('ss-name').value;
    const month = document.getElementById('ss-month').value;
    const amount = parseFloat(document.getElementById('ss-amount').value);
    const fileInput = document.getElementById('ss-receipt');

    if (!name || !month || isNaN(amount)) return alert("Fill all required salary fields.");

    const btn = event.target;
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        let receiptUrl = null;

        // Compress and encode the image if one is attached
        if (fileInput.files.length > 0) {
            receiptUrl = await compressImage(fileInput.files[0]);
        }

        // Save to database
        await addDoc(collection(db, "erp_staff_salaries"), {
            date, name, month, amount, receiptUrl
        });

        alert("Salary Logged!");

        // Clear the form
        document.getElementById('ss-name').value = '';
        document.getElementById('ss-amount').value = '';
        fileInput.value = '';
        document.getElementById('ss-file-name').innerText = "📁 Click to select slip...";
        document.getElementById('ss-file-name').style.color = "#777";

    } catch (error) {
        console.error("Save Error:", error);
        alert("Error saving data. Check console.");
    } finally {
        btn.innerText = "Log Salary Payout";
        btn.disabled = false;
    }
};
// --- AUTO-FILL WORKER RATE ---
document.getElementById('wp-worker').addEventListener('change', function () {
    // 1. Get the exact option the user just clicked
    const selectedOption = this.options[this.selectedIndex];

    // 2. Extract the hidden rate from it
    const masterRate = selectedOption.getAttribute('data-rate');

    // 3. Drop it into the Rate input box!
    const rateInput = document.getElementById('wp-rate');
    if (masterRate && masterRate !== "undefined") {
        rateInput.value = masterRate;
    } else {
        rateInput.value = ''; // Clears it if no worker is selected
    }
});
// --- UPDATE FILE NAME & VALIDATE FILE TYPE ---
window.updateFileName = function (input, textId) {
    const displayText = document.getElementById(textId);

    if (input.files && input.files.length > 0) {
        const file = input.files[0];

        // 🔴 THE BOUNCER: Check if it's actually an image
        if (!file.type.startsWith('image/')) {
            alert("⚠️ Invalid file type! Please upload an image file (JPG, PNG, etc.).");
            input.value = ''; // Instantly kick the bad file out of the input
            displayText.innerText = "❌ Invalid File. Click to try again...";
            displayText.style.color = "#d32f2f"; // Turn text red
            return; // Stop the function here
        }

        // If it passes the bouncer, show success!
        displayText.innerText = "📄 " + file.name;
        displayText.style.color = "#2e7d32";
        displayText.style.fontWeight = "bold";
    } else {
        // Reset if they click cancel
        displayText.innerText = "📁 Click to select file...";
        displayText.style.color = "#777";
        displayText.style.fontWeight = "normal";
    }
};

// 1. Create a global array to hold the heavy data in memory
window.currentReceiptData = []; 

// This now expects two things when clicked: the folder name, and the title for the popup
window.viewReceipts = async function(collectionName, categoryTitle) {
    const grid = document.getElementById('modal-grid');
    const title = document.getElementById('modal-title'); // We update the title dynamically now
    
    openModal('receipt-modal');
    title.innerText = `${categoryTitle} Receipts`; 
    grid.innerHTML = '<p style="text-align: center; width: 100%; padding: 20px;">Loading...</p>';

    try {
        // 1. Fetch ONLY the specific folder you clicked on
        const querySnapshot = await getDocs(collection(db, collectionName));

        if (querySnapshot.empty) {
            grid.innerHTML = `<p style="text-align: center; width: 100%; color: #888;">No records found in ${categoryTitle}.</p>`;
            return;
        }

        window.currentReceiptData = [];
        let html = '';
        const docs = querySnapshot.docs.reverse(); 

        docs.forEach((doc) => {
            const data = doc.data();
            
            // 2. Only show cards that actually have an image attached
            if (data.receiptUrl) {
                // Save to memory for the Image Viewer
                const memoryIndex = window.currentReceiptData.length;
                window.currentReceiptData.push(data);
                
                // Smart Name Detection (since different folders use different names)
                let displayName = data.client || data.supplier || data.worker || data.name || data.head || 'Unknown';
                let amount = data.amount || data.total || 0;

                html += `
                    <div class="receipt-card" style="cursor: pointer;" onclick="viewImage(${memoryIndex})">
                        <div class="rcpt-client">${displayName}</div>
                        <div class="rcpt-date">📅 ${data.date || 'No Date'}</div>
                        <div class="rcpt-amount" style="font-weight: bold;">₹${amount}</div>
                    </div>
                `;
            }
        });

        // 3. What if records exist, but no one uploaded a photo?
        if (window.currentReceiptData.length === 0) {
            grid.innerHTML = `<p style="text-align: center; width: 100%; color: #888;">Records exist, but no image proofs were attached.</p>`;
            return;
        }

        grid.innerHTML = html;

    } catch (error) {
        console.error("Error loading specific receipts:", error);
        grid.innerHTML = `<p style="color: red; text-align: center; width: 100%;">Error: ${error.message}</p>`;
    }
};

// --- IMAGE VIEWER LOGIC (Remains the same!) ---
window.viewImage = function(index) {
    const receipt = window.currentReceiptData[index];
    const url = receipt ? receipt.receiptUrl : null;

    if (!url) { alert("No image attached!"); return; }

    const displayImg = document.getElementById('modal-display-image');
    if (displayImg) {
        displayImg.src = url; 
        openModal('modal-image-viewer');
    }
};