# Lumira — 1.7.54 güncellemesi

Bu paket, gönderdiğin ZIP arşivindeki 8522a37153fea0b84fbf09b1e891a4f3bcd00cb5 sürümü temel alınarak hazırlandı. Mevcut sayfa yapısı, tema, renkler ve altı dil korunmuştur. Bu dosyalar GitHub'a veya canlı siteye yüklenmedi.

## Kurulum

1. Mevcut reponun yedeğini al. Oturum açtıktan sonra Ayarlar içindeki ilerleme yedeğini de indirebilirsin.
2. Bu paketteki `index.html`, `progress.js`, `pwa.js`, `sw.js` dosyalarını reponun kökünde aynı isimli dosyalarla değiştir.
3. Yeni `vocab-extra.js`, `improvements.js`, `improvements.css` dosyalarını aynı köke ekle. Yedi uygulama dosyasını aynı commit içinde yayınla.
4. Diğer dosyalar açıklama ve geliştirici testleridir; sitenin çalışması için gerekli değildir. Eski altı sözlük dosyasını, görselleri, Firebase yapılandırmasını ve diğer dosyaları koru.
5. Yayın tamamlandığında siteyi aç. Güncelleme bildirimi çıkarsa Güncelle'ye bas. Telefona kurulmuş PWA'da da yeni sürümü yükle.

## Yapılan değişiklikler

1. **Yazma kontrolü:** Boş veya geçersiz servis cevabı artık temiz metin olarak gösterilmiyor. HTTP hatası, internet yokluğu, 20 saniyelik zaman aşımı, istek sınırı ve eksik kontrol ayrı ele alınıyor.
2. **Sonucun dürüstlüğü:** “Harika, hatasız metin” iddiası kaldırıldı. Otomatik kontrolün hata kaçırabileceği ve anlam/seviye doğrulaması yapmadığı açıklandı. Seçilen seviyenin yalnızca üslup önerilerini filtrelediği belirtildi.
3. **Güncel metin:** Yazı değişince devam eden istek iptal ediliyor, eski sonuç temizleniyor. Eski bir cevap yeni metne uygulanmıyor.
4. **Taslak:** Dil ve seviyeye göre yazı taslağı aynı açık sayfa oturumunda korunuyor. Sayfa yenilenince kapanır; kalıcı yazı arşivi değildir. Ctrl/Command + Enter kısayolu, alan etiketi, canlı sonuç duyurusu ve Arapça için otomatik yazı yönü eklendi.
5. **Öneriler:** Çakışan öneriler listeden kaybolmuyor; çakışan düzeltme otomatik uygulanmıyor. Önerilen metnin ilk servis önerilerinden oluştuğu belirtiliyor. Servisin yüksek güvenle başka dil saptaması durumunda dil seçimi uyarısı gösteriliyor.
6. **Metnin gönderilmesi:** Kontrol düğmesinin altında LanguageTool ve gizlilik bağlantıları yer alıyor. Yazının kontrol servisine gönderileceği belirtiliyor.
7. **Kelime ilerlemesi:** Arapça, Rusça ve aksanlı kelimeleri aynı kayıt anahtarına dönüştürebilen eski yöntem değiştirildi. Yeni 36.750 kayıt için anahtarlar benzersiz. Anahtarlar bellekte önbelleklenerek tekrar tekrar hesaplanmaları önlendi.
8. **Eski kayıtların taşınması:** Hangi kelimeye ait olduğu belirlenebilen ilerleme aktarılıyor. Eski kayıtlar silinmiyor. Belirsiz kayıtlar birden fazla kelimeyi yanlışlıkla “bilinen” yapmıyor; eski ve yeni kayıtlar istatistiklerde çift sayılmıyor. Sonradan yüklenen diller de taşıma kapsamına alınıyor.
9. **Kişisel ekranın yüklenmesi:** Yerel ilerleme ağ yanıtı beklemeden kullanılabiliyor. Başka kullanıcı için gelmiş veya kullanıcı çalışmaya başladıktan sonra gelmiş eski yanıtların ekranı değiştirmesi sınırlandırıldı.
10. **Quiz şıkları:** Kategori, seviye ve dil havuzlarından seçilen çeldiricilerde aynı Türkçe anlamın birden fazla şıkta yer alması önlendi. Kişisel, dinleme ve seviye tespiti quizleri aynı denetimi kullanıyor.
11. **Quiz geçişleri:** Geri/ileri/bitir, yeniden başlatma veya sekme değiştirme sırasında eski otomatik geçiş zamanlayıcısının yeni soruyu atlatması engellendi. Boş listede önceki sorunun şıkları ve sayacı kalmıyor.
12. **Yazarak cevaplama:** Benzer kelimeleri doğru kabul eden 1–2 harflik tolerans kaldırıldı. Örneğin `schon` ile `schön`, `form` ile `from` eşit sayılmıyor. Büyük/küçük harf ve çevre noktalaması normalleştiriliyor; yakın yanlışlara açıklama veriliyor ama doğruluk puanı verilmiyor.
13. **Boşluk doldurma:** Gerçek kelime sınırlarıyla Unicode eşleştirme yapılıyor. Cümlede hedef kelime tam bulunamazsa alıştırma atlanmak yerine Türkçe anlamdan kelime yazma sorusuna dönüşüyor. Boş gönderim ve aynı cevabı tekrar kontrol etme engellendi.
14. **Seviye tespiti kaydı:** Yarım kalan sınav kullanıcıya göre ayrılıyor. Cevaptan hemen sonra Kaydet ve Çık kullanılırsa aynı sorunun tekrar puan kazandırması önleniyor. Bilinen kelime kayıtlarına güncelleme zamanı ekleniyor.
15. **Notlarım kayıt güvenliği:** Unicode kelimelerin kimlikleri artık birbirine karışmıyor. Önceden kaydedilmiş favoriler içerik üzerinden bulunuyor. Eski favoriler tek atomik işlemle taşınıyor; yerel eski defter kopyası korunuyor. Otomatik kopya temizliği yalnızca tüm ilgili alanları aynı olan kayıtları eşleştiriyor.
16. **Notlarım formu:** Türkçe anlam zorunlu oldu. Kaydetme tamamlanmadan başarı gösterilmiyor; başarısız kayıtta form korunuyor. Yinelenen kayıt düzenleme sırasında da kontrol ediliyor. Yazı alanı odaktayken gelen verinin formu yeniden çizmesi önleniyor.
17. **Örnek çevirisi:** Örnek cümlenin Türkçe çevirisini ekleme/düzenleme alanı eklendi. Kullanıcının kendi yazdığı cümleye alakasız hazır çeviri eklenmesi kaldırıldı.
18. **Defter yedeği:** Notlarım'a JSON dışa aktarma ve doğrulanan yedekten kelime ekleme getirildi. İçe aktarma mevcut kelimeleri ezmez; uygunsuz dosyayı veya geçersiz kaydı reddeder. Eski sürümde anlamı boş bırakılmış notlar ve kayıt tarihleri yedekten korunarak alınır; anlamı eksik notlar quize katılmaz. Bu akış hesaptaki deftere yazar. Defterin yerel okuma kopyası da tutulur.
19. **Silme işlemi:** Silinen kelime için 12 saniyelik Geri Al işlemi eklendi. İlgili hesaba geri eklenir; başka hesaba geçilmişse uygulanmaz.
20. **Yerel ilerleme yedeği:** Genel yedek yalnızca ilgili uygulama anahtarlarını içerir; Firebase oturum anahtarları ve ilgisiz site verileri dışarı alınmaz. İçe aktarım dosya boyutunu ve veri biçimini kontrol eder; yazma hatasında önceki değerleri geri koymayı dener. Bu yedek cihazdaki yerel kopyadır; defterin sunucuya geri yüklemesi için Notlarım'daki ayrı içe aktarma kullanılır.
21. **Güvenli metin gösterimi:** Kart örnekleri, hata listesi ve bildirim metinleri HTML olarak çalıştırılmadan gösteriliyor. Kayıtlı kart konumunda geçersiz/negatif indeks engellendi; boş kart görünümünde eski sayaç ve etiketler temizleniyor.
22. **Klavye ve erişilebilirlik:** Sekmeler, dil/seviye seçimleri ve ilgili kartlar Enter/Boşluk ile çalışıyor. Görünür odak çerçeveleri, şifre ve yazı alanı etiketleri eklendi. Ayar panellerinde odak yönetimi, Tab sınırlandırması ve Escape ile kapatma sağlandı. Şifre baştan gizli açılıyor. Hareket azaltma tercihi kar efektinde de uygulanıyor.
23. **Mobil düzen:** Yazma ve not alanlarında okunur giriş boyutu, düzenli yedekleme düğmeleri ve taşan metinlere karşı küçük CSS düzenlemeleri eklendi. Mevcut tasarımın yerine yeni bir tema konmadı.
24. **Çevrimdışı/PWA:** Gizlilik sayfası artık ana sayfa önbelleğini ezmiyor. Sürüm parametreli JS/CSS istekleri çevrimdışında önbellekteki dosyaları bulabiliyor. Kod isteğinde sunucu hatası varsa önbelleğe dönülüyor. Eksik sözlük indirmesi tamamlandı olarak işaretlenmiyor. Yeni dosyalar uygulama önbelleğine eklendi.
25. **Sözlük:** Altı dile sekizer yeni günlük ifade eklendi: yavaş konuşma/tekrar isteme, rezervasyon, aktarma, Wi-Fi, adres veya randevu gibi ihtiyaçlar. Her kayıtta Türkçe anlam ve örnek cümle/çevirisi var. Toplam **36.702 → 36.750**. Bunlar kelime/ifade kayıtlarıdır; 48 bağımsız tek kelime oldukları iddia edilmez. Yeni kayıtların A2 etiketi yaklaşık öğretim seviyesidir.

## Veri geçişi hakkında önemli not

Orijinal sözlükte farklı kelimelerin aynı eski anahtarı aldığı 236 grup bulundu. Bu durumda önceden hangi kelimenin gerçekten bilindiğini koddan kesin olarak çıkarmak mümkün değildir. Belirsiz ilerleme yanlış kelimeye taşınmaz; bazı eski “bilinen kelime” sayıları bu nedenle düşebilir. Ham eski kayıtlar ve XP silinmez. İlk sunucu yüklemesi sırasında kazanılan XP ayrıca korunur; bekleyen bir isteğin başka hesaba veri yazması önlenir. Eski biçimde yarım bırakılmış bir seviye testi yeni kullanıcıya özel biçime otomatik aktarılmaz; o sınavı yeniden başlatmak gerekir.

## Doğrulama ve sınırlar

- 22 JavaScript/inline script için sözdizimi kontrolü geçti; başvurulan yerel JS/CSS dosyalarında eksik bulunmadı.
- Yazma, taslak, hata cevapları, Unicode kimlikler, boşluk doldurma ve şık seçimleri için otomatik kontroller geçti. Altı dilde toplam 300 örnek şık kümesi denetlendi.
- Service worker için 6 senaryo geçti: ana sayfa/gizlilik ayrımı, çevrimdışı sürümlü dosya, HTTP hata yedeği ve eksik/tam indirme.
- DOM ortamında bütün sayfa açılışı, kart/quiz/notlar/yazma geçişleri, kayıt başarısızlığı/başarısı ve içe aktarım doğrulaması çalıştırıldı. Gerçek Firebase yerine taklit yanıtlar kullanıldı; canlı hesaba veri yazılmadı.
- Gerçek tarayıcı kurulumu ağ nedeniyle tamamlanamadı. Ekran görüntüsü, gerçek mobil yerleşim, cihaz TTS sesi ve kurulu Android PWA davranışı bu ortamda doğrulanmadı.
- Canlı LanguageTool doğruluk oranı ölçülmedi. Servis her gramer/anlam hatasını yakalama garantisi vermez. Resmî API notu: https://dev.languagetool.org/public-http-api.html
- Firebase yönetici konsolu/kuralları, Google Play ödeme yapılandırması ve gerçek satın alma işlemleri erişim kapsamında değildi; bu sunucu ayarlarının doğruluğu veya güvenliği onaylanmış değildir. Bu pakette değişmediler.
- Mevcut 36 bin kaydın tamamı dilbilimsel olarak yeniden kontrol edilmedi. Alan tamlığı, kimlikler ve yeni ifadeler incelendi; tam sözlük kalitesi garantisi verilmez.

## İstemediğin değişiklikleri geri alma

Yukarıdaki numaraları söylemen yeterli; ilgili değişiklikleri aynı temel sürüm üzerinden ayırabiliriz. Tam geri dönüş için orijinal ZIP'teki `index.html`, `progress.js`, `pwa.js`, `sw.js` dosyalarını geri koy; bu paketin eklediği üç uygulama dosyası kullanılmaz hâle gelir. Service worker güncellemesinin kullanıcılara ulaşması ayrıca sağlanmalıdır. Tarayıcı verilerini/toplu depolamayı silme; kullanıcı ilerlemesi orada bulunabilir.

## Son kontrol — 10 Eylül 2026

Bu pakette önceki düzeltmelerin tamamı vardır. Ek kontrol sonuçları ve beş ilave düzeltme `SON_KONTROL.md` dosyasındadır. Önceki ZIP yerine bu paketi kullan.
