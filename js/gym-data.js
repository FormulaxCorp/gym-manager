/* ============================================
   Gym Member Manager — Data Layer (Supabase)
   Pola sama dengan Financial Planner: 1 tabel app_data,
   doc JSON per id, RLS per user_id.
   Prefix "gym_" biar ga bentrok dgn data Fin Planner.
   ============================================ */
const GymData = (() => {
  'use strict';

  const cache = {
    members: [],      // {id, nama, noWa, email, paket, mulai, berakhir, status, freeze, notes}
    packages: [],     // {id, nama, durasiBulan, harga, note}
    payments: [],     // {id, member_id, tanggal, nominal, metode, keterangan, bukti}
    checkins: []      // {id, member_id, tanggal, waktu, by}
  };

  const DEFAULT_PACKAGES = [
    { id: 'pkg-bulanan', nama: 'Bulanan', durasiBulan: 1, harga: 350000, note: '30 hari' },
    { id: 'pkg-3bulan', nama: '3 Bulan', durasiBulan: 3, harga: 950000, note: '90 hari, hemat' },
    { id: 'pkg-6bulan', nama: '6 Bulan', durasiBulan: 6, harga: 1800000, note: '180 hari' },
    { id: 'pkg-12bulan', nama: '12 Bulan', durasiBulan: 12, harga: 3200000, note: '1 tahun' }
  ];

  // ---- persistence ----
  async function loadAllData() {
    const userId = Auth.getUserId();
    if (!userId) return;
    const { data, error } = await supabase
      .from('app_data')
      .select('id, data')
      .eq('user_id', userId);
    if (error) { console.error('load error', error); return; }
    data.forEach(row => {
      if (row.id === 'gym_members') cache.members = row.data.items || [];
      if (row.id === 'gym_packages') cache.packages = (row.data.items || []).length ? row.data.items : DEFAULT_PACKAGES.map(p=>({...p}));
      if (row.id === 'gym_payments') cache.payments = row.data.items || [];
      if (row.id === 'gym_checkins') cache.checkins = row.data.items || [];
    });
    if (!cache.packages.length) cache.packages = DEFAULT_PACKAGES.map(p => ({...p}));
  }

  async function saveDoc(docId, payload) {
    const userId = Auth.getUserId();
    const record = { id: docId, data: payload, updated_at: new Date().toISOString() };
    if (userId) record.user_id = userId;
    const { error } = await supabase.from('app_data').upsert(record);
    if (error) { console.error('save error', error); return false; }
    return true;
  }

  const saveMembers = (items) => saveDoc('gym_members', { items });
  const savePackages = (items) => saveDoc('gym_packages', { items });
  const savePayments = (items) => saveDoc('gym_payments', { items });
  const saveCheckins = (items) => saveDoc('gym_checkins', { items });

  // ---- helpers ----
  function genId(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36);
  }
  function today() { return new Date().toISOString().slice(0,10); }
  function addMonths(dateStr, months) {
    const d = new Date(dateStr);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    // clamp ke akhir bulan (hindari overflow: 31 Jan +1 != 2 Mar)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return d.toISOString().slice(0,10);
  }
  function daysUntil(dateStr) {
    const d = new Date(dateStr); const t = new Date(today());
    return Math.round((d - t) / 86400000);
  }
  // status: active | expiring | expired | freeze
  function memberStatus(m) {
    if (m.freeze) return 'freeze';
    const du = daysUntil(m.berakhir);
    if (du < 0) return 'expired';
    if (du <= 7) return 'expiring';
    return 'active';
  }
  function formatRp(n) {
    return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  }
  function formatDate(s) {
    if (!s) return '-';
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
  }
  function getMember(id) { return cache.members.find(m => m.id === id) || null; }
  function getPackage(id) { return cache.packages.find(p => p.id === id) || null; }

  // ---- members ----
  function getMembers() { return [...cache.members]; }
  async function addMember(m) {
    m.id = genId('mem');
    m.createdAt = new Date().toISOString();
    cache.members.push(m);
    return saveMembers(cache.members);
  }
  async function updateMember(id, updates) {
    const i = cache.members.findIndex(x => x.id === id);
    if (i === -1) return false;
    cache.members[i] = { ...cache.members[i], ...updates };
    return saveMembers(cache.members);
  }
  async function deleteMember(id) {
    cache.members = cache.members.filter(x => x.id !== id);
    // bersihkan transaksi & checkin member ini
    cache.payments = cache.payments.filter(x => x.member_id !== id);
    cache.checkins = cache.checkins.filter(x => x.member_id !== id);
    await Promise.all([saveMembers(cache.members), savePayments(cache.payments), saveCheckins(cache.checkins)]);
    return true;
  }
  async function activateMember(id, packageId, mulaiStr) {
    const pkg = getPackage(packageId);
    const mulai = mulaiStr || today();
    const berakhir = pkg ? addMonths(mulai, pkg.durasiBulan) : addMonths(mulai, 1);
    const i = cache.members.findIndex(x => x.id === id);
    if (i === -1) return false;
    cache.members[i] = { ...cache.members[i], paket: packageId, mulai, berakhir, freeze: false };
    return saveMembers(cache.members);
  }
  async function extendMember(id, packageId) {
    const m = cache.members.find(x => x.id === id);
    if (!m) return false;
    const pkg = getPackage(packageId);
    if (!pkg) return false;
    // perpanjang dari tanggal berakhir saat ini (jika masih aktif) atau dari hari ini
    const base = (memberStatus(m) === 'active' || memberStatus(m) === 'expiring') ? m.berakhir : today();
    const berakhir = addMonths(base, pkg.durasiBulan);
    const i = cache.members.findIndex(x => x.id === id);
    cache.members[i] = { ...cache.members[i], paket: packageId, berakhir, freeze: false };
    return saveMembers(cache.members);
  }
  async function toggleFreeze(id) {
    const m = cache.members.find(x => x.id === id);
    if (!m) return false;
    const i = cache.members.findIndex(x => x.id === id);
    cache.members[i] = { ...cache.members[i], freeze: !m.freeze };
    return saveMembers(cache.members);
  }

  // ---- packages ----
  function getPackages() { return [...cache.packages]; }
  async function addPackage(p) { p.id = genId('pkg'); cache.packages.push(p); return savePackages(cache.packages); }
  async function updatePackage(id, updates) {
    const i = cache.packages.findIndex(x => x.id === id);
    if (i === -1) return false;
    cache.packages[i] = { ...cache.packages[i], ...updates };
    return savePackages(cache.packages);
  }
  async function deletePackage(id) {
    cache.packages = cache.packages.filter(x => x.id !== id);
    return savePackages(cache.packages);
  }

  // ---- payments ----
  function getPayments() { return [...cache.payments].sort((a,b) => (b.tanggal||'').localeCompare(a.tanggal||'')); }
  async function addPayment(p) {
    p.id = genId('pay');
    if (!p.tanggal) p.tanggal = today();
    cache.payments.push(p);
    return savePayments(cache.payments);
  }
  async function deletePayment(id) {
    cache.payments = cache.payments.filter(x => x.id !== id);
    return savePayments(cache.payments);
  }

  // ---- checkins ----
  function getCheckins() { return [...cache.checkins].sort((a,b) => (b.tanggal+b.waktu).localeCompare(a.tanggal+a.waktu)); }
  async function addCheckin(memberId, by) {
    const now = new Date();
    const c = { id: genId('cin'), member_id: memberId, tanggal: today(), waktu: now.toTimeString().slice(0,5), by: by || 'staf' };
    cache.checkins.push(c);
    return saveCheckins(cache.checkins);
  }
  function checkinCountFor(memberId, dateStr) {
    return cache.checkins.filter(c => c.member_id === memberId && (!dateStr || c.tanggal === dateStr)).length;
  }
  // deteksi ghost: member aktif tapi ga pernah check-in dalam 30 hari
  function ghostMembers() {
    const cutoff = addMonths(today(), -1);
    return cache.members.filter(m => {
      if (memberStatus(m) !== 'active') return false;
      return !cache.checkins.some(c => c.member_id === m.id && c.tanggal >= cutoff);
    });
  }

  // ---- dashboard / laporan ----
  function dashboardStats() {
    let active = 0, expiring = 0, expired = 0, freeze = 0;
    cache.members.forEach(m => { const s = memberStatus(m); if (s==='active') active++; else if (s==='expiring') expiring++; else if (s==='expired') expired++; else if (s==='freeze') freeze++; });
    return { total: cache.members.length, active, expiring, expired, freeze };
  }
  function revenueMonth(monthKey) {
    // monthKey '2026-08'
    let total = 0;
    cache.payments.forEach(p => { if ((p.tanggal||'').slice(0,7) === monthKey) total += Number(p.nominal || 0); });
    return total;
  }
  function monthKeyOf(dateStr) { return (dateStr || today()).slice(0,7); }

  return {
    loadAllData, saveDoc,
    getMembers, addMember, updateMember, deleteMember, activateMember, extendMember, toggleFreeze,
    getPackages, addPackage, updatePackage, deletePackage,
    getPayments, addPayment, deletePayment,
    getCheckins, addCheckin, checkinCountFor, ghostMembers,
    getMember, getPackage, memberStatus,
    dashboardStats, revenueMonth,
    formatRp, formatDate, today, addMonths, daysUntil, genId,
    DEFAULT_PACKAGES
  };
})();
