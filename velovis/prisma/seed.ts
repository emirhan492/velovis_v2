// prisma/seed.ts
// Senin "sıfırdan" dosyanın, projenin 'schema.prisma' dosyasına uyarlanmış,
// hatasız çalışan nihai hali.

import { PrismaClient, OrderStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt'; // DÜZELTME: 'bcryptjs' yerine 'bcrypt'

// Prisma client'ı başlat
const prisma = new PrismaClient();

// Slugify fonksiyonu (Türkçe karakterleri de temizler)
function slugify(text: string): string {
  const a =
    'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìıİłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūůűųẃẍÿýžźż·/_,:;';
  const b =
    'aaaaaaaaaacccddeeeeeeeegghiiiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------';
  const p = new RegExp(a.split('').join('|'), 'g');

  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Boşlukları - ile değiştir
    .replace(p, (c) => b.charAt(a.indexOf(c))) // Özel karakterleri değiştir
    .replace(/&/g, '-ve-') // & karakterini 've' ile değiştir
    .replace(/[^\w\-]+/g, '') // Alfanümerik olmayanları kaldır
    .replace(/\-\-+/g, '-') // Birden fazla -'yi tek - yap
    .replace(/^-+/, '') // Başlangıçtaki -'yi kaldır
    .replace(/-+$/, ''); // Sondaki -'yi kaldır
}

async function main() {
  console.log('🌱 Tohumlama (seeding) işlemi başlıyor...');

  // ----------------------------------------------------------------
  // 1. TEMİZLİK (İlişkisel sıraya göre tersten)
  // (Bu kod, senin 'schema.prisma' dosyanla %100 uyumlu)
  // ----------------------------------------------------------------
  console.log('🧹 Eski veriler temizleniyor...');
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.productComment.deleteMany();
  await prisma.productPhoto.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.permission.deleteMany(); // (Orijinal 'seed.ts' dosyamızda bu vardı, bunu da temizleyelim)
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
  console.log('🧹 Temizlik tamamlandı.');

  // ----------------------------------------------------------------
  // 2. YETKİLER (Orijinal 'seed.ts' dosyamızdan)
  // ----------------------------------------------------------------
  console.log('🔨 Yetkiler oluşturuluyor...');
  const permissionsList = [
    'users:create',
    'users:read',
    'users:update',
    'users:delete',
    'roles:create',
    'roles:read',
    'roles:update',
    'roles:delete',
    'permissions:read',
    'products:create',
    'products:read',
    'products:update',
    'products:delete',
    'categories:create',
    'categories:read',
    'categories:update',
    'categories:delete',
    'orders:read',
    'orders:update',
    'comments:create',
    'comments:read',
    'comments:update',
    'comments:delete',
  ];
  await prisma.permission.createMany({
    data: permissionsList.map((name) => ({ name })),
  });
  const allPermissions = await prisma.permission.findMany();
  console.log(`✨ ${allPermissions.length} yetki oluşturuldu.`);

  // ----------------------------------------------------------------
  // 3. ROLLER (Bağımsız)
  // ----------------------------------------------------------------
  console.log('🔨 Roller oluşturuluyor...');
  const adminRole = await prisma.role.create({
    data: {
      name: 'ADMIN',
      // Tüm yetkileri 'ADMIN' rolüne bağlayalım (Orijinal 'seed.ts' mantığı)
      permissions: {
        connect: allPermissions.map((p) => ({ id: p.id })),
      },
    },
  });
  const userRole = await prisma.role.create({
    data: { name: 'USER' },
  });
  console.log(`✨ ${adminRole.name} ve ${userRole.name} rolleri oluşturuldu.`);

  // ----------------------------------------------------------------
  // 4. KULLANICILAR (Bağımsız)
  // ----------------------------------------------------------------
  console.log('🔨 Kullanıcılar oluşturuluyor...');
  const salt = await bcrypt.genSalt(10); // 'bcrypt' kullanıldı
  const hashedPassword = await bcrypt.hash('Admin123!', salt);
  const hashedPasswordUser = await bcrypt.hash('User123!', salt);

  const adminUser = await prisma.user.create({
    data: {
      // DÜZELTME: 'firstName' ve 'lastName' yerine 'fullName'
      fullName: 'Admin User',
      username: 'admin',
      email: 'admin@example.com',
      password: hashedPassword,
      isActive: true,
    },
  });

  const user1 = await prisma.user.create({
    data: {
      // DÜZELTME: 'firstName' ve 'lastName' yerine 'fullName'
      fullName: 'Ali Veli',
      username: 'aliveli',
      email: 'ali.veli@example.com',
      password: hashedPasswordUser,
      isActive: true,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      // DÜZELTME: 'firstName' ve 'lastName' yerine 'fullName'
      fullName: 'Ayşe Yılmaz',
      username: 'ayseyilmaz',
      email: 'ayse.yilmaz@example.com',
      password: hashedPasswordUser,
      isActive: false, // Pasif kullanıcı
    },
  });
  console.log(
    `✨ ${adminUser.username}, ${user1.username}, ${user2.username} oluşturuldu.`,
  );

  // ----------------------------------------------------------------
  // 5. KULLANICI-ROL EŞLEŞMESİ (User ve Role'e bağlı)
  // (Kodun %100 uyumlu)
  // ----------------------------------------------------------------
  console.log('🔗 Kullanıcılar rollere bağlanıyor...');
  await prisma.userRole.create({
    data: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });
  await prisma.userRole.create({
    data: {
      userId: adminUser.id,
      roleId: userRole.id,
    },
  });
  await prisma.userRole.create({
    data: {
      userId: user1.id,
      roleId: userRole.id,
    },
  });
  await prisma.userRole.create({
    data: {
      userId: user2.id,
      roleId: userRole.id,
    },
  });
  console.log('🔗 Rol bağlantıları tamamlandı.');

  // ----------------------------------------------------------------
  // 6. KATEGORİLER (Bağımsız)
  // ----------------------------------------------------------------
  console.log('🔨 Kategoriler oluşturuluyor...');
  const catElektronik = await prisma.category.create({
    data: {
      name: 'Elektronik',
      slug: 'elektronik',
      // DÜZELTME: 'order' alanı 'schema.prisma' dosyanızda yok.
    },
  });

  const catGiyim = await prisma.category.create({
    data: {
      name: 'Giyim & Moda',
      slug: 'giyim-moda',
    },
  });

  const catKitap = await prisma.category.create({
    data: {
      name: 'Kitap, Müzik, Film',
      slug: 'kitap-muzik-film',
    },
  });
  console.log(
    `✨ ${catElektronik.name}, ${catGiyim.name}, ${catKitap.name} kategorileri oluşturuldu.`,
  );

  // ----------------------------------------------------------------
  // 7. ÜRÜNLER (Category'ye bağlı)
  // ----------------------------------------------------------------
  console.log('🔨 Ürünler oluşturuluyor...');

  const product1Name = 'Akıllı Telefon X1000';
  const product1 = await prisma.product.create({
    data: {
      name: product1Name,
      slug: slugify(product1Name),
      // DÜZELTME: 'short/longDescription' yerine 'description'
      description:
        'Yeni nesil amiral gemisi akıllı telefon. Bu telefon, 120Hz ekranı, 108MP kamerası ve 5000mAh bataryası ile öne çıkıyor. Tüm gün kullanım ve profesyonel fotoğrafçılık için ideal.',
      price: 29999.99,
      // DÜZELTME: 'primaryPhotoUrl' alanı 'schema.prisma' dosyanızda yok.
      // DÜZELTME: 'stockQuantity' yerine 'stock'
      stock: 50,
      categoryId: catElektronik.id, // İlişki
    },
  });

  const product2Name = 'Kablosuz Kulaklık Pro';
  const product2 = await prisma.product.create({
    data: {
      name: product2Name,
      slug: slugify(product2Name),
      description:
        'Aktif gürültü engelleme özellikli kulaklık. Mükemmel ses kalitesi ve 30 saate varan pil ömrü. Kristal netliğinde görüşmeler için 3 mikrofonlu sistem.',
      price: 4599.5,
      stock: 120,
      categoryId: catElektronik.id, // İlişki
    },
  });

  const product3Name = 'Erkek Deri Ceket';
  const product3 = await prisma.product.create({
    data: {
      name: product3Name,
      slug: slugify(product3Name),
      description:
        'Hakiki kuzu derisi, vintage model. Soğuk havalar için ideal, şık ve dayanıklı. İç astarı yünlüdür ve vücudu sıcak tutar.',
      price: 7899.0,
      stock: 30,
      categoryId: catGiyim.id, // İlişki
    },
  });

  const product4Name = 'Bilim Kurgu Klasikleri Seti';
  const product4 = await prisma.product.create({
    data: {
      name: product4Name,
      slug: slugify(product4Name),
      description:
        '5 kitaptan oluşan özel kutulu set. Dune, Vakıf, 2001: Bir Uzay Destanı ve daha fazlası. Bilim kurgu severler için kaçırılmayacak bir koleksiyon.',
      price: 1250.0,
      stock: 75,
      categoryId: catKitap.id, // İlişki
    },
  });

  console.log(
    `✨ ${product1.name}, ${product2.name}, ${product3.name}, ${product4.name} oluşturuldu.`,
  );

  // ----------------------------------------------------------------
  // 8. ÜRÜN FOTOĞRAFLARI (Product'a bağlı)
  // (Kodun %100 uyumlu)
  // ----------------------------------------------------------------
  console.log('📸 Ürün fotoğrafları ekleniyor...');
  await prisma.productPhoto.createMany({
    data: [
      {
        url: 'https://picsum.photos/id/1/600/600',
        size: 150,
        isPrimary: true,
        order: 1,
        productId: product1.id, // İlişki
      },
      {
        url: 'https://picsum.photos/id/56/600/600',
        size: 155,
        isPrimary: false,
        order: 2,
        productId: product1.id, // İlişki
      },
      {
        url: 'https://picsum.photos/id/117/600/600',
        size: 140,
        isPrimary: true,
        order: 1,
        productId: product2.id, // İlişki
      },
    ],
  });
  console.log('📸 Fotoğraflar eklendi.');

  // ----------------------------------------------------------------
  // 9. ÜRÜN YORUMLARI (User ve Product'a bağlı)
  // (Kodun %100 uyumlu)
  // ----------------------------------------------------------------
  console.log('✍️ Yorumlar ekleniyor...');
  await prisma.productComment.create({
    data: {
      title: 'Harika bir telefon!',
      content: 'Kamerası beklediğimden çok daha iyi. Pil ömrü de harika.',
      rating: 5,
      userId: user1.id, // İlişki
      productId: product1.id, // İlişki
    },
  });

  await prisma.productComment.create({
    data: {
      title: 'Tavsiye etmiyorum',
      content: 'Gürültü engelleme özelliği çok zayıf. İade edeceğim.',
      rating: 2,
      userId: user2.id, // İlişki
      productId: product2.id, // İlişki
    },
  });

  await prisma.productComment.create({
    data: {
      title: 'Fena değil',
      content: 'Sesi güzel ama kulağıma tam oturmadı.',
      rating: 3,
      userId: user1.id, // İlişki
      productId: product2.id, // İlişki
    },
  });
  console.log('✍️ Yorumlar eklendi.');

  // ----------------------------------------------------------------
  // 10. SİPARİŞ VE SİPARİŞ KALEMLERİ (User, Order, Product'a bağlı)
  // (Kodun %100 uyumlu)
  // ----------------------------------------------------------------
  console.log('🛒 Siparişler oluşturuluyor...');

  // Ali Veli'nin Siparişi (2 adet telefon, 1 adet ceket)
  const order1TotalPrice = product1.price * 2 + product3.price;
  const order1 = await prisma.order.create({
    data: {
      totalPrice: order1TotalPrice,
      status: OrderStatus.PAID, // Enum kullanımı
      userId: user1.id, // İlişki
      items: {
        create: [
          {
            quantity: 2,
            unitPrice: product1.price,
            productId: product1.id, // İlişki
          },
          {
            quantity: 1,
            unitPrice: product3.price,
            productId: product3.id, // İlişki
          },
        ],
      },
    },
  });

  // Ayşe Yılmaz'ın Siparişi (1 adet kitap seti, bekliyor)
  const order2TotalPrice = product4.price * 1;
  const order2 = await prisma.order.create({
    data: {
      totalPrice: order2TotalPrice,
      status: OrderStatus.PENDING, // Enum kullanımı
      userId: user2.id, // İlişki
      items: {
        create: [
          {
            quantity: 1,
            unitPrice: product4.price,
            productId: product4.id, // İlişki
          },
        ],
      },
    },
  });

  console.log(
    `✨ 2 adet sipariş (ID: ${order1.id}, ${order2.id}) ve kalemleri oluşturuldu.`,
  );

  // ----------------------------------------------------------------
  // 11. SEPET (User ve Product'a bağlı)
  // (Kodun %100 uyumlu)
  // ----------------------------------------------------------------
  console.log('🧺 Sepetler oluşturuluyor...');
  // Ali Veli'nin sepetinde 1 adet kulaklık var
  await prisma.cartItem.create({
    data: {
      quantity: 1,
      userId: user1.id,
      productId: product2.id,
    },
  });
  console.log('🧺 Sepet kalemleri eklendi.');
}

// ----------------------------------------------------------------
// ANA ÇALIŞTIRMA VE HATA YAKALAMA
// ----------------------------------------------------------------
main()
  .then(async () => {
    console.log('✅ Tohumlama başarıyla tamamlandı!');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Tohumlama sırasında bir hata oluştu:');
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
