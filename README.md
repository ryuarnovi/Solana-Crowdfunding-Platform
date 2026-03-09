# Solana Crowdfunding Program (Kickstarter on-chain)

Program ini adalah *Smart Contract* crowdfunding yang dibangun menggunakan framework Anchor. Program ini memungkinkan siapapun untuk membuat kampanye penggalangan dana, melakukan donasi (contribute), serta fitur penarikan dana (withdraw) jika sukses atau pengembalian dana (refund) jika gagal.

## 🚀 Fitur Utama
1.  **Create Campaign**: Menetapkan target (goal) dan batas waktu (deadline).
2.  **Contribute**: Donasi aman yang disimpan di dalam *Vault PDA* (bukan langsung ke creator).
3.  **Withdraw**: Creator hanya bisa menarik dana jika target tercapai dan deadline sudah lewat.
4.  **Refund**: Donatur bisa mengambil kembali dananya jika kampanye gagal (target tidak tercapai) setelah deadline.

---

## 🛠 Persiapan Lingkungan (macOS)
Karena adanya isu metadata file di macOS (`._genesis.bin`), ikuti langkah-langkah berikut dengan seksama:

### 1. Bersihkan Lingkungan
Hapus sisa-sisa ledger lama dan file metadata yang bisa merusak validator:
```bash
find . -name "._*" -delete
rm -rf test-ledger
```

### 2. Jalankan Local Validator
Gunakan variabel `COPYFILE_DISABLE` agar validator tidak error saat dijalankan:
```bash
export COPYFILE_DISABLE=1
solana-test-validator --reset
```
*(Biarkan terminal ini tetap terbuka selama pengembangan/pengujian)*

---

## 📦 Build dan Deploy

### 1. Set Toolchain Rust (Stable)
Gunakan versi 1.83.0 untuk menghindari error "Edition 2024":
```bash
rustup override set 1.83.0
```

### 2. Build Program
```bash
anchor build --no-idl
```

### 3. Deploy ke Localnet
Pastikan validator sedang berjalan:
```bash
solana program deploy target/deploy/crowdfunding.so
```
**Program ID:** `7KUPLcHBAA5rGoq7LawQWBkCBGNgiaUoqsVsvKrtZyzJ`

---

## 🧪 Cara Menjalankan Pengujian (Testing)

Kami telah menyediakan skrip pengujian otomatis yang mengikuti skenario lengkap (*Kickstarter Checklist*).

### Jalankan Skrip Checklist:
Buka terminal baru dan jalankan:
```bash
# Pastikan berada di folder project
cd solana/crowdfunding

# Jalankan pengujian otomatis (Node.js)
node run_checklist.js
```

**Skenario yang diuji dalam skrip:**
- [x] Membuat kampanye (Target 2 SOL, Deadline 8 detik).
- [x] Kontribusi pertama (1.2 SOL).
- [x] Kontribusi kedua (1.0 SOL) -> Target Terlampaui.
- [x] Gagal Withdraw sebelum deadline (Security Check).
- [x] Berhasil Withdraw setelah deadline lewat.
- [x] Gagal Withdraw kedua kali (Double Claim Protection).

---

## 🔧 Troubleshooting
- **Error: Archive error: extra entry found**: Jalankan kembali `find . -name "._*" -delete` dan gunakan `export COPYFILE_DISABLE=1`.
- **Error: constant_time_eq (Edition 2024)**: Pastikan Anda menggunakan `rustup override set 1.83.0` dan dependensi sudah dipinned di `Cargo.toml`.
- **Unexpected Blockhash error**: Sebagian besar disebabkan oleh validator yang belum siap. Tunggu beberapa detik atau restart validator dengan `--reset`.

---

## 📁 Struktur Folder Penting
- `programs/crowdfunding/src/lib.rs`: Logika utama Smart Contract (Rust).
- `run_checklist.js`: Skrip pengujian otomatis skenario dunia nyata.
- `Anchor.toml`: Konfigurasi project Anchor.
- `crowdfunding.json`: IDL darurat untuk komunikasi antar skrip.
