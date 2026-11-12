'use strict';
const img = (id) => `assets/guns/${id}.jpg`;

const DEFAULT_PRODUCTS = [
  { id: 1,  name: "Glock 19 Gen5",         brand: "Glock",           cat: "Pistol",   caliber: "9mm",           price: 599,  rating: 4.8, reviews: 1820, stock: 14, desc: "Compact, reliable and accurate. The most popular 9mm pistol for duty and personal protection." },
  { id: 2,  name: "Sig Sauer P320",        brand: "Sig Sauer",       cat: "Pistol",   caliber: "9mm",           price: 679,  rating: 4.6, reviews: 1240, stock: 10, desc: "Modular striker-fired pistol with a serialized fire-control unit and excellent ergonomics." },
  { id: 3,  name: "Beretta 92FS",          brand: "Beretta",         cat: "Pistol",   caliber: "9mm",           price: 749,  rating: 4.5, reviews: 980,  stock: 8,  desc: "Classic Italian double-action pistol known for smooth shooting and a long service history." },
  { id: 4,  name: "Colt 1911 Government",  brand: "Colt",            cat: "Pistol",   caliber: ".45 ACP",       price: 1049, rating: 4.7, reviews: 760,  stock: 6,  desc: "The legendary single-action .45 with a crisp trigger and over a century of heritage." },
  { id: 5,  name: "CZ 75 SP-01",           brand: "CZ",              cat: "Pistol",   caliber: "9mm",           price: 689,  rating: 4.7, reviews: 640,  stock: 9,  desc: "Czech all-steel pistol praised for its comfortable grip, low recoil and tight accuracy." },
  { id: 6,  name: "S&W M&P9 Shield",       brand: "Smith & Wesson",  cat: "Pistol",   caliber: "9mm",           price: 449,  rating: 4.4, reviews: 1510, stock: 18, desc: "Slim single-stack concealed-carry pistol that is light, thin and easy to shoot." },

  { id: 7,  name: "Colt Python",           brand: "Colt",            cat: "Revolver", caliber: ".357 Magnum",   price: 1499, rating: 4.9, reviews: 410,  stock: 4,  desc: "The 'Cadillac of revolvers' with a bright stainless finish and a famously smooth trigger." },
  { id: 8,  name: "Smith & Wesson 686",    brand: "Smith & Wesson",  cat: "Revolver", caliber: ".357 Magnum",   price: 949,  rating: 4.7, reviews: 530,  stock: 7,  desc: "Stainless 6-shot (7-shot Plus) revolver, a favorite for target, home defense and the field." },
  { id: 9,  name: "Ruger GP100",           brand: "Ruger",           cat: "Revolver", caliber: ".357 Magnum",   price: 829,  rating: 4.6, reviews: 470,  stock: 9,  desc: "Tough, full-size stainless revolver built to handle heavy magnum loads all day." },
  { id: 10, name: "Taurus Judge",          brand: "Taurus",          cat: "Revolver", caliber: ".45 LC / .410", price: 479,  rating: 3.9, reviews: 320,  stock: 12, desc: "Unique revolver that fires both .45 Long Colt and .410 shotshells." },

  { id: 11, name: "Colt AR-15 Sporter",    brand: "Colt",            cat: "Rifle",    caliber: "5.56 NATO",     price: 1299, rating: 4.8, reviews: 880,  stock: 11, desc: "The original AR-15 platform: light, modular and easy to customize." },
  { id: 12, name: "AK-47 Classic",         brand: "Kalashnikov",     cat: "Rifle",    caliber: "7.62x39",       price: 1199, rating: 4.7, reviews: 1360, stock: 13, desc: "World-famous for toughness and reliability in any condition." },
  { id: 13, name: "Ruger 10/22",           brand: "Ruger",           cat: "Rifle",    caliber: ".22 LR",        price: 319,  rating: 4.8, reviews: 2210, stock: 25, desc: "America's favorite rimfire. Cheap to shoot, perfect for beginners and plinking." },
  { id: 14, name: "Springfield M1A",       brand: "Springfield",     cat: "Rifle",    caliber: ".308 Win",      price: 1699, rating: 4.6, reviews: 390,  stock: 5,  desc: "Semi-automatic battle rifle derived from the M14, a match-grade favorite." },
  { id: 15, name: "Winchester Model 70",   brand: "Winchester",      cat: "Rifle",    caliber: ".300 WSM",      price: 1099, rating: 4.5, reviews: 450,  stock: 7,  desc: "'The Rifleman's Rifle', a classic bolt-action hunting rifle with a smooth action." },
  { id: 16, name: "Marlin 1894 Classic",   brand: "Marlin",          cat: "Rifle",    caliber: ".357 Magnum",   price: 1049, rating: 4.4, reviews: 280,  stock: 6,  desc: "Handy lever-action carbine that shares ammo with .357 revolvers." },

  { id: 17, name: "Remington 870 Wingmaster", brand: "Remington",    cat: "Shotgun",  caliber: "12 Gauge",      price: 589,  rating: 4.7, reviews: 1700, stock: 15, desc: "Legendary pump-action shotgun with a smooth action trusted by hunters and police." },
  { id: 18, name: "Mossberg 500",          brand: "Mossberg",        cat: "Shotgun",  caliber: "12 Gauge",      price: 429,  rating: 4.6, reviews: 1950, stock: 20, desc: "Affordable, dependable pump-action with ambidextrous safety and great value." },
  { id: 19, name: "Benelli M4 Super 90",   brand: "Benelli",         cat: "Shotgun",  caliber: "12 Gauge",      price: 1999, rating: 4.9, reviews: 520,  stock: 3,  desc: "Premium semi-auto tactical shotgun with a self-regulating gas system." },
  { id: 20, name: "Beretta A400 Xplor",    brand: "Beretta",         cat: "Shotgun",  caliber: "12 Gauge",      price: 1549, rating: 4.5, reviews: 340,  stock: 5,  desc: "Soft-recoil semi-auto for hunting and sporting clays." },

  { id: 21, name: "HK MP5",                brand: "Heckler & Koch",  cat: "SMG",      caliber: "9mm",           price: 2899, rating: 4.9, reviews: 610,  stock: 3,  desc: "The world's most recognized submachine gun, famed for accuracy and controllability." },
  { id: 22, name: "CZ Scorpion EVO 3",     brand: "CZ",              cat: "SMG",      caliber: "9mm",           price: 899,  rating: 4.5, reviews: 720,  stock: 9,  desc: "Modern, affordable 9mm carbine with a smooth blowback action." },
  { id: 23, name: "B&T APC9 K",            brand: "B&T",             cat: "SMG",      caliber: "9mm",           price: 1799, rating: 4.4, reviews: 210,  stock: 4,  desc: "Swiss-made compact 9mm with a reliable, modular design." },
  { id: 24, name: "IWI UZI Pro",           brand: "IWI",             cat: "SMG",      caliber: "9mm",           price: 1349, rating: 4.3, reviews: 260,  stock: 6,  desc: "Modern take on the iconic Israeli SMG." },

  { id: 25, name: "Barrett M82A1",         brand: "Barrett",         cat: "Sniper",   caliber: ".50 BMG",       price: 9499, rating: 4.9, reviews: 150,  stock: 2,  desc: "The legendary .50 caliber anti-materiel rifle for extreme long-range shooting." },
  { id: 26, name: "Remington 700 SPS",     brand: "Remington",       cat: "Sniper",   caliber: ".308 Win",      price: 799,  rating: 4.6, reviews: 640,  stock: 12, desc: "The standard bolt-action platform behind countless precision and hunting rifles." },
  { id: 27, name: "Accuracy Intl AWM",     brand: "Accuracy Intl",   cat: "Sniper",   caliber: ".338 Lapua",    price: 6999, rating: 4.8, reviews: 130,  stock: 2,  desc: "Magnum-class military sniper rifle with exceptional accuracy beyond 1,000 meters." },
  { id: 28, name: "Savage 110",            brand: "Savage",          cat: "Sniper",   caliber: ".30-06",        price: 999,  rating: 4.5, reviews: 480,  stock: 5,  desc: "Accurate bolt-action long-range rifle with a smooth, dependable action." }
].map((p) => ({ ...p, image: img(p.id) }));

const CATEGORIES = ["Pistol", "Revolver", "Rifle", "Shotgun", "SMG", "Sniper"];
const ORDER_STATUSES = ["Pending", "Approved", "Shipped", "Delivered", "Cancelled"];

module.exports = { DEFAULT_PRODUCTS, CATEGORIES, ORDER_STATUSES };
