# Lumira · Dil Kartları — PWA Kurulum ve Yayın Rehberi

Bu klasör, yayına hazır tam bir **PWA** (Progressive Web App) paketidir.
Dosyaları olduğu gibi sunucuna / GitHub Pages'e yükle, hepsi bu.

---

## 1. Ne eklendi?

| Dosya | Görevi |
|---|---|
| `manifest.json` | Uygulama kimliği, ikonlar, kısayollar, paylaşım hedefi, ekran görüntüleri |
| `sw.js` | Service Worker: çevrimdışı çalışma, önbellek, push bildirimi, otomatik güncelleme |
| `pwa.js` | Geri tuşu, kısayollar, deep link, bildirim, favoriler, yedekleme, ayar paneli |
| `pwa.css` | Kenardan kenara yerleşim, alt paneller, toast, yeni **Lumira** splash tasarımı |
| `offline.html` | İnternet yokken ve önbellek boşken gösterilen sayfa |
| `icon-*.png` | 48 → 512 px tüm ikonlar + **maskable** (adaptive) + monokrom |
| `apple-touch-icon.png`, `favicon.*` | iOS ve tarayıcı ikonları |
| `ios/splash-*.jpg` | 12 farklı iPhone/iPad için iOS açılış ekranı |
| `sc-*.png` | Uygulama kısayolu ikonları |
| `screenshot-*.jpg` | Play Store / kurulum kartı görselleri |
| `.well-known/assetlinks.json` | Bubblewrap (TWA) doğrulaması — **doldurulacak** |
| `twa-manifest.json` | Bubblewrap yapılandırma şablonu — **doldurulacak** |
| `widgets/` | "Günün Kelimesi" widget şablonu |

**Silinenler:** `img-192.png`, `img-512.png`, `preview.PNG`, eski `manifest.json`, eski `sw.js`,
`index.html` içindeki eski Service Worker kaydı ve var olmayan `sky.css` / `motion.js` bağlantıları.

---

## 2. Yayınlama (GitHub Pages)

```bash
git add -A
git commit -m "PWA: manifest, service worker, Lumira splash, ikonlar"
git push
```

Repo → **Settings → Pages → Branch: main / root**.
Adresin şu şekilde olur: `https://KULLANICI-ADIN.github.io/turkishdeucard/`

> **HTTPS zorunlu.** Service Worker yalnızca `https://` veya `localhost` üzerinde çalışır.

### Test
1. Chrome'da siteyi aç → **F12 → Application → Manifest**: hata olmamalı.
2. **Application → Service Workers**: "activated and is running" yazmalı.
3. **Lighthouse → PWA**: yeşil olmalı.
4. Uçak modunu aç, sayfayı yenile → uygulama açılmalı.

---

## 3. Uygulama içinde neler var?

Sağ alttaki **⚙️** düğmesi tüm yeni özellikleri açar:

- 🔔 **Günlük hatırlatma** — saati sen seçiyorsun, izin verildiğinde her gün bildirim gelir
  (uygulama kapalıyken `periodicSync`, açıkken zamanlayıcı ile).
- 📦 **Çevrimdışı paket** — 6 dilin tüm sözlüklerini (~5 MB) tek dokunuşla indirir, ilerleme çubuğu gösterir.
- ⭐ **Favoriler** — kartın sağ üstündeki yıldız; liste, paylaşma ve dışa aktarma.
- ⬇️ **Yedekle / ⬆️ geri yükle** — tüm ilerlemen JSON dosyası olarak iner veya paylaşılır.
- 🔗 **Uygulamayı paylaş** — cihazın yerel paylaşım menüsü.
- 🔄 **Güncelleme denetimi** — yeni sürüm yüklendiğinde "✨ Yeni sürüm hazır · Güncelle" bildirimi.
- 🐞 **Hata raporu** — son 40 hata cihazda saklanır, tek dokunuşla paylaşılır.
- 💛 **Puan ver** — 6. açılıştan ve 2 günden sonra kibarca sorar (bir kez kapatılabilir).

Ayrıca otomatik çalışanlar:

- **Android geri tuşu**: açık panel → kapatır · quiz/kişisel sekme → kartlara döner · kökte iki kez basınca çıkar.
- **Kaldığın yerden devam**: son çalıştığın dil/seviye/kelime hatırlatılır.
- **Kısayollar**: uygulama ikonuna basılı tut → Kartlar · Quiz · Günün kelimesi · İlerlemem.
- **Paylaşım hedefi**: başka bir uygulamadan metin paylaşınca Dil Kartları listede çıkar, kelimeyi favoriye ekleyebilirsin.
- **Deep link**: `?lang=fr&tab=quiz&level=A2`, `?action=daily`, `?action=favorites`.
- **Çevrimdışı rozeti**, yumuşak sekme geçişleri (View Transitions), güvenli alan (çentik/gezinme çubuğu) desteği.

### Ayarlanabilir yerler
`pwa.js` en üstündeki `CONFIG` bloğu:

```js
packageId:    'com.lumira.dilkartlari',  // Bubblewrap ile AYNI olmalı
playUrl:      'https://play.google.com/store/apps/details?id=...',
vapidKey:     '',   // gerçek push kullanacaksan Web Push açık anahtarı
pushEndpoint: '',   // abonelikleri kaydedeceğin sunucu
errorEndpoint:'',   // hata raporlarının gideceği adres (yoksa sadece cihazda kalır)
reminderHour: 20    // varsayılan hatırlatma saati
```

### Sürüm çıkarken
Dosyalarda değişiklik yaptığında `sw.js` içindeki tek satırı artır:

```js
const CACHE_VERSION = 'v1.0.1';
```

Kullanıcılar otomatik olarak "Yeni sürüm hazır" uyarısını görür.

---

## 4. Bubblewrap ile Play Store paketi (TWA)

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://KULLANICI-ADIN.github.io/turkishdeucard/manifest.json
bubblewrap build
```

`twa-manifest.json` şablonunu kullanacaksan içindeki `SENIN-ALAN-ADIN` yazan yerleri
kendi adresinle değiştir; `packageId` `pwa.js` içindeki ile aynı olmalı.

### Adres çubuğunu kaldırmak için (zorunlu adım)
1. Parmak izini al:
   ```bash
   bubblewrap fingerprint list
   # veya
   keytool -list -v -keystore android.keystore -alias android
   ```
2. `SHA256` değerini `.well-known/assetlinks.json` içindeki
   `BURAYA_BUBBLEWRAP_SHA256_PARMAK_IZINI_YAPISTIR` yerine yapıştır.
3. Push et ve `https://ADRESIN/.well-known/assetlinks.json` adresinin açıldığını doğrula.
4. Play Console **App Signing** kullanıyorsan oradaki SHA-256'yı da aynı listeye ekle
   (iki parmak izi birlikte durabilir).

Doğrulama tamamlanınca uygulama adres çubuğu olmadan, tam ekran açılır.

### Android 16 / 17 notları
- `minSdkVersion: 23` ve Bubblewrap'in güncel sürümü kullanılıyor (target SDK 35+ otomatik gelir).
- Android 15+ **zorunlu edge-to-edge** çizim yapar; `pwa.css` içindeki `env(safe-area-inset-*)`
  dolguları sayesinde içerik durum/gezinme çubuklarının altında kalmaz.
- Android 13+ bildirim izni çalışma anında istenir — ayar panelindeki anahtar bunu tetikler.
- `enableNotifications: true` olduğu için TWA bildirim köprüsü etkin gelir.

---

## 5. iOS

`apple-mobile-web-app-capable`, durum çubuğu stili ve 12 adet açılış görseli eklendi.
Kullanıcı Safari'de **Paylaş → Ana Ekrana Ekle** yapınca uygulama tam ekran açılır;
uygulama zaten 2. açılışta bunu adım adım anlatan bir rehber gösteriyor.
iOS 16.4+ üzerinde ana ekrana eklendikten sonra bildirimler de çalışır.

---

## 6. Bilerek yapılmayanlar (dürüst not)

Bunlar tarayıcı içinden mümkün değil, **native kod** gerektirir:

- **Android ana ekran widget'ı**: gerçek bir widget için TWA projesine küçük bir
  `AppWidgetProvider` eklemek gerekir. Paket içinde manifest `widgets` girişi ve
  `widgets/daily-word.*` şablonu hazır — Windows Widgets Board'da şimdiden çalışır,
  Android tarafında ise "Günün kelimesi" kısayolu bunun yerini tutar.
- **Play In-App Review** (uygulama içi puanlama diyaloğu): TWA'dan çağrılamaz;
  paket bunun yerine Play Store sayfasına yönlendiren kibar bir istek gösterir.
- **Firebase Crashlytics**: web tarafında karşılığı yok. Yerine `pwa.js` içinde
  kendi hata kaydı var; `errorEndpoint` verirsen hatalar sunucuna da gönderilir.
- **Gerçek push bildirimi** için bir sunucu ve VAPID anahtarı gerekir. Altyapı (`sw.js`
  `push` olayı, FCM formatı desteği, abonelik akışı) hazır; anahtarı `CONFIG`'e yazman yeterli.

---

Lumira · Dil Kartları — iyi çalışmalar 🌙
