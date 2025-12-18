import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, setDoc, getDoc,
  collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ---------- helpers ---------- */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/* ---------- donor card (UI) ---------- */
function donorCard(d) {
  const dist = Number.isFinite(d.distanceKm) ? `${d.distanceKm.toFixed(2)} km away` : "Distance N/A";
  const last = d.lastDonationDate ? d.lastDonationDate : "N/A";

  const days = daysSince(d.lastDonationDate);
  const eligible = (days === null) ? true : (days >= 90);

  const eligibilityBadge = eligible
    ? `<span class="badge bg-success ms-2">Eligible</span>`
    : `<span class="badge bg-warning text-dark ms-2">Not eligible (${90 - days} days left)</span>`;

  const availabilityBadge = d.isAvailable
    ? `<span class="badge bg-success ms-2">Available</span>`
    : `<span class="badge bg-secondary ms-2">Unavailable</span>`;

  const phone = d.phone ? d.phone : "";
  const waLink = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : "#";
  const callLink = phone ? `tel:${phone}` : "#";

  const contactButtons = phone
    ? `
      <div class="d-flex gap-2">
        <a class="btn btn-outline-danger btn-sm" href="${callLink}">
          <i class="fas fa-phone me-1"></i>Call
        </a>
        <a class="btn btn-danger btn-sm" href="${waLink}" target="_blank" rel="noreferrer">
          <i class="fab fa-whatsapp me-1"></i>WhatsApp
        </a>
      </div>
    `
    : `<button class="btn btn-outline-secondary btn-sm" disabled>Contact hidden</button>`;

  return `
    <div class="col-md-6 mb-3">
      <div class="card donor-card h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h5 class="mb-0">${d.fullName || "Donor"}</h5>
              <small class="text-muted">${d.city || "Dhaka, Bangladesh"}</small>
            </div>
            <span class="distance-badge">${dist}</span>
          </div>

          <div class="my-3">
            <span class="blood-group">${d.bloodGroup || ""}</span>
            ${availabilityBadge}
            ${eligibilityBadge}
          </div>

          <div class="mb-2"><i class="fas fa-calendar me-2"></i>Last donation: ${last}</div>
          <div class="mb-3"><i class="fas fa-map-marker-alt me-2"></i>${d.area || "—"}</div>

          ${contactButtons}
        </div>
      </div>
    </div>
  `;
}

/* ---------- main ---------- */
document.addEventListener("DOMContentLoaded", async () => {

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      window.scrollTo({ top: el.offsetTop - 70, behavior: "smooth" });
    });
  });

  // Toggle signup forms
  const userTypeBtns = document.querySelectorAll(".user-type-btn");
  const userForms = document.querySelectorAll(".user-form");

  userTypeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-type");
      userTypeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      userForms.forEach(f => {
        f.classList.remove("active");
        if (f.id === `${type}Form`) f.classList.add("active");
      });
    });
  });

  // Stats
  await refreshStats();

  // Use my location
  const btnUseMyLocation = document.getElementById("btnUseMyLocation");
  const myLat = document.getElementById("myLat");
  const myLng = document.getElementById("myLng");

  btnUseMyLocation?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Your browser does not support geolocation.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        myLat.value = pos.coords.latitude.toFixed(6);
        myLng.value = pos.coords.longitude.toFixed(6);
      },
      () => alert("Location permission denied. You can type lat/lng manually.")
    );
  });

  // Search donors
  const btnSearch = document.getElementById("btnSearch");
  btnSearch?.addEventListener("click", async () => {
    const group = document.getElementById("searchBloodGroup").value;
    const lat = safeNum(myLat.value);
    const lng = safeNum(myLng.value);

    if (!group) return alert("Please select Blood Group.");
    if (lat === null || lng === null) return alert("Please set your latitude & longitude (Use My Location).");

    const donors = await findNearbyDonors(lat, lng, group);
    renderDonors(donors);
    document.getElementById("donors")?.scrollIntoView({ behavior: "smooth" });
  });

  // Login
  const loginForm = document.getElementById("loginForm");
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = loginForm.querySelector('[name="email"]').value.trim();
    const password = loginForm.querySelector('[name="password"]').value.trim();

    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Login Successful!");
      window.location.href = "./pages/dashboard.html";
    } catch (err) {
      alert(err?.message || "Login failed");
    }
  });

  // Donor signup
  const donorForm = document.getElementById("donorForm");
  donorForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = donorForm.querySelector('[name="fullName"]').value.trim();
    const phone = donorForm.querySelector('[name="phone"]').value.trim();
    const bloodGroup = donorForm.querySelector('[name="bloodGroup"]').value;
    const lastDonationDate = donorForm.querySelector('[name="lastDonationDate"]').value;
    const disease = donorForm.querySelector('[name="disease"]').value;

    const lat = safeNum(donorForm.querySelector('[name="lat"]').value);
    const lng = safeNum(donorForm.querySelector('[name="lng"]').value);

    const email = donorForm.querySelector('[name="email"]').value.trim();
    const password = donorForm.querySelector('[name="password"]').value.trim();

    if (lat === null || lng === null) return alert("Latitude/Longitude must be numbers.");

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, "users", cred.user.uid), {
        role: "donor",
        fullName,
        phone,
        email,
        bloodGroup,
        lastDonationDate,
        disease,
        location: { lat, lng },
        isAvailable: true,
        createdAt: Date.now()
      });

      alert("Donor Registration Successful! Now login.");

            // ✅ Close signup modal + reset form + open login modal
      donorForm.reset();

      const signupModalEl = document.getElementById("signupModal");
      const loginModalEl = document.getElementById("loginModal");

      if (signupModalEl && window.bootstrap) {
        const m = window.bootstrap.Modal.getInstance(signupModalEl) || new window.bootstrap.Modal(signupModalEl);
        m.hide();
      }

      if (loginModalEl && window.bootstrap) {
        const m2 = window.bootstrap.Modal.getInstance(loginModalEl) || new window.bootstrap.Modal(loginModalEl);
        m2.show();
      }







    } catch (err) {
      alert(err?.message || "Signup failed");
    }
  });

  // Recipient signup
  const recipientForm = document.getElementById("recipientForm");
  recipientForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const requesterName = recipientForm.querySelector('[name="requesterName"]').value.trim();
    const requesterPhone = recipientForm.querySelector('[name="requesterPhone"]').value.trim();
    const email = recipientForm.querySelector('[name="email"]').value.trim();
    const password = recipientForm.querySelector('[name="password"]').value.trim();

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, "users", cred.user.uid), {
        role: "recipient",
        requesterName,
        requesterPhone,
        email,
        createdAt: Date.now()
      });

      alert("Recipient Account Created! Now login.");


           // ✅ Close signup modal + reset form + open login modal
      recipientForm.reset();

      const signupModalEl = document.getElementById("signupModal");
      const loginModalEl = document.getElementById("loginModal");

      if (signupModalEl && window.bootstrap) {
        const m = window.bootstrap.Modal.getInstance(signupModalEl) || new window.bootstrap.Modal(signupModalEl);
        m.hide();
      }

      if (loginModalEl && window.bootstrap) {
        const m2 = window.bootstrap.Modal.getInstance(loginModalEl) || new window.bootstrap.Modal(loginModalEl);
        m2.show();
      }





    } catch (err) {
      alert(err?.message || "Signup failed");
    }
  });

  // Optional log
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) console.log("Logged in as:", snap.data().role);
  });
});

/* ---------- Firestore queries ---------- */
async function refreshStats() {
  const donorSnap = await getDocs(query(collection(db, "users"), where("role", "==", "donor")));
  const reqSnap = await getDocs(collection(db, "requests"));

  const statDonors = document.getElementById("statDonors");
  const statRequests = document.getElementById("statRequests");

  if (statDonors) statDonors.textContent = donorSnap.size;
  if (statRequests) statRequests.textContent = reqSnap.size;
}

async function findNearbyDonors(myLat, myLng, bloodGroup) {
  const q = query(
  collection(db, "users"),
  where("role", "==", "donor"),
  where("bloodGroup", "==", bloodGroup),
  where("isAvailable", "==", true),
  where("isVerified", "==", true)
);


  const snap = await getDocs(q);

  const donors = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.location?.lat != null && d.location?.lng != null)
    .map(d => ({
      ...d,
      distanceKm: haversineKm(myLat, myLng, d.location.lat, d.location.lng)
    }))
    // ✅ Eligibility filter: last donation থেকে 90 দিন পূর্ণ না হলে show হবে না
    .filter(d => {
      const days = daysSince(d.lastDonationDate);
      return days === null ? true : days >= 90;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return donors;
}

function renderDonors(list) {
  const row = document.getElementById("donorsRow");
  if (!row) return;

  if (!list.length) {
    row.innerHTML = `
      <div class="col-12">
        <div class="alert alert-warning mb-0">
          No eligible donors found nearby for this group.
        </div>
      </div>
    `;
    return;
  }

  row.innerHTML = list.map(donorCard).join("");
}
