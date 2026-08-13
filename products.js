const products = [
  {
    id: "lucky_bag",
    name: "福袋",
    price: 550,
    bundleCount: 3,
    bundlePrice: 1500,
    isFixedPrice: true,
    hiddenFromProductButtons: true,
    trackStock: false,
    variants: []
  },
  
  {
    id: "gashapon",
    name: "好運摸魚徽章扭蛋",

    price: 650,
    bundleCount: 2,
    bundlePrice: 1200,

    isFixedPrice: true,
    hiddenFromProductButtons: true,
    trackStock: false,

    prizes: [
      {
        id: "gold",
        name: "金色狐魚徽章",
        rewardType: "ych",
        reward: "設定概念圖",
      },
      {
        id: "blue",
        name: "藍色狐魚徽章",
        rewardType: "ych",
        reward: "色塊頭貼YCH",
      },
      {
        id: "green",
        name: "綠色狐魚徽章",
        rewardType: "ych",
        reward: "飲料YCH",
      },
      {
        id: "red",
        name: "紅色狐魚徽章",
        rewardType: "coupon",
        reward: "800抵用券",
        maxValue: 800,
        allowTopUp: true,
        excluded: ["狐番賞"]
      }
    ]
  },

  {
    id: "puji",
    name: "噗嘰",
    price: 160,
    variants: [
     {
      name: "飢餓狐",
      stock: 100,
      image: "images/puji_hungry_fox.jpg"
     },

     {
      name: "生氣狐",
      stock: 100,
      image: "images/puji_angry_fox.jpg"
     },

     {
      name: "生氣伊布",
      stock: 100,
      image: "images/puji_angry_eevee.jpg"
     }
    ]
  },

  {
    id: "fox_side_bag",
    name: "狐狸側背包",
    price: 450,
    variants: [
      { name: "綠色", stock: 100 },
      { name: "白色", stock: 100 },
      { name: "黑色", stock: 100 }
    ]
  },

  {
    id: "fox_travel_bag",
    name: "狐狸大旅行包",
    price: 650,
    variants: [
      { name: "綠色", stock: 100 },
      { name: "米色", stock: 100 },
      { name: "黑色", stock: 100 }
    ]
  },

  {
    id: "fox_bottle_bag",
    name: "狐狸水壺包",
    price: 380,
    variants: [
      { name: "白色", stock: 100 },
      { name: "黑色", stock: 100 },
      { name: "黃色", stock: 100 },
      { name: "綠色", stock: 100 }
    ]
  },

  {
    id: "transparent_waist_bag",
    name: "透明腰包",
    price: 380,
    variants: [
      {
        name: "淡藍",
        stock: 100,
        image: "images/transparent_waist_bag_light_blue.jpg"
      },
      {
        name: "米白",
        stock: 100,
        image: "images/transparent_waist_bag_ivory.jpg"
      },
      {
        name: "黑",
        stock: 100,
        image: "images/transparent_waist_bag_black.jpg"
      }
    ]
  },

  {
    id: "eye_mask",
    name: "眼罩",
    price: 300,
    stock: 100,
    image: "images/eye_mask.jpg",
    variants: []
  },

  {
    id: "fox_plush_keychain",
    name: "肉球抱抱狐玩偶吊飾",
    price: 320,
    stock: 100,
    variants: []
  },

  {
    id: "fox_towel",
    name: "狐狸擦手巾",
    price: 350,
    stock: 100,
    variants: []
  },

  {
    id: "eevee_card_holder",
    name: "伊布卡套",
    price: 250,
    stock: 100,
    variants: []
  },

  {
    id: "postcard_sticker_set",
    name: "明信片貼紙套組",
    price: 50,
    stock: 100,
    variants: []
  },

  {
    id: "postcard",
    name: "明信片",
    price: 20,
    stock: 100,
    image: "images/postcard.jpg",
    variants: []
  },

  {
    id: "fox_rug",
    name: "狐狸地毯",
    price: 450,
    stock: 100,
    variants: []
  },

  {
    id: "slacking_hat",
    name: "摸魚帽",
    price: 280,
    variants: [
      { name: "黑色", stock: 100 },
      { name: "咖色", stock: 100 },
      { name: "米色", stock: 100 },
      { name: "綠色", stock: 100 }
    ]
  },

  {
    id: "acrylic_stand",
    name: "壓克力飯友",
    price: 120,
    bundleCount: 3,
    bundlePrice: 300,
    variants: [
  {
    name: "悠閒狐",
    stock: 100,
    image: "images/acrylic_stand_relaxed_fox.jpg"
  },

  {
    name: "鹿",
    stock: 100,
    image: "images/acrylic_stand_deer.jpg"
  },

  {
    name: "哭哭狐",
    stock: 100,
    image: "images/acrylic_stand_crying_fox.jpg"
  },

  {
    name: "愛心狐",
    stock: 100,
    image: "images/acrylic_stand_heart_fox.jpg"
  },

  {
    name: "發瘋狐",
    stock: 100,
    image: "images/acrylic_stand_crazy_fox.jpg"
  },

  {
    name: "生氣狐",
    stock: 100,
    image: "images/acrylic_stand_angry_fox.jpg"
  },

  {
    name: "貪吃狐",
    stock: 100,
    image: "images/acrylic_stand_hungry_fox.jpg"
  },

  {
    name: "伊布",
    stock: 100,
    image: "images/acrylic_stand_eevee.jpg"
  },

  {
    name: "月伊布",
    stock: 100,
    image: "images/acrylic_stand_umbreon.jpg"
  },

  {
    name: "仙子伊布",
    stock: 100,
    image: "images/acrylic_stand_sylveon.jpg"
  },

  {
    name: "冰伊布",
    stock: 100,
    image: "images/acrylic_stand_glaceon.jpg"
  },

  {
    name: "炫彩吊飾",
    stock: 100,
    image: "images/acrylic_stand_iridescent_charm.jpg"
  },

  {
    name: "好運守",
    stock: 100,
    image: "images/acrylic_stand_lucky_charm.jpg"
  }
]
  },

  {
    id: "butt_clip",
    name: "雙面屁屁夾",
    price: 80,
    bundleCount: 3,
    bundlePrice: 200,

   variants: [
  {
    name: "正常狐",
    stock: 100,
    image: "images/butt_clip_normal_fox.jpg"
  },

  {
    name: "瞇眼狐",
    stock: 100,
    image: "images/butt_clip_sleepy_fox.jpg"
  },

  {
    name: "不爽狐",
    stock: 100,
    image: "images/butt_clip_angry_fox.jpg"
  },

  {
    name: "伊布",
    stock: 100,
    image: "images/butt_clip_eevee.jpg"
  },

  {
    name: "火伊布",
    stock: 100,
    image: "images/butt_clip_flareon.jpg"
  },

  {
    name: "雷伊布",
    stock: 100,
    image: "images/butt_clip_jolteon.jpg"
  },

  {
    name: "水伊布",
    stock: 100,
    image: "images/butt_clip_vaporeon.jpg"
  },

  {
    name: "月伊布",
    stock: 100,
    image: "images/butt_clip_umbreon.jpg"
  },

  {
    name: "色違月伊布",
    stock: 100,
    image: "images/butt_clip_shiny_umbreon.jpg"
  },

  {
    name: "太陽伊布",
    stock: 100,
    image: "images/butt_clip_espeon.jpg"
  },

  {
    name: "冰伊布",
    stock: 100,
    image: "images/butt_clip_glaceon.jpg"
  },

  {
    name: "葉伊布",
    stock: 100,
    image: "images/butt_clip_leafeon.jpg"
  },

  {
    name: "仙子伊布",
    stock: 100,
    image: "images/butt_clip_sylveon.jpg"
  },

  {
    name: "色違仙子伊布",
    stock: 100,
    image: "images/butt_clip_shiny_sylveon.jpg"
  },

  {
    name: "毛毛",
    stock: 100,
    image: "images/butt_clip_maomao.jpg"
  },

  {
    name: "岩狗狗",
    stock: 100,
    image: "images/butt_clip_rockruff.jpg"
  },

  {
    name: "阿勃普通",
    stock: 100,
    image: "images/butt_clip_absol_normal.jpg"
  },

  {
    name: "阿勃X",
    stock: 100,
    image: "images/butt_clip_absol_x.jpg"
  },

  {
    name: "阿勃Y",
    stock: 100,
    image: "images/butt_clip_absol_y.jpg"
  },

  {
    name: "路卡利歐",
    stock: 100,
    image: "images/butt_clip_lucario.jpg"
  },

  {
    name: "捷拉奧拉",
    stock: 100,
    image: "images/butt_clip_zeraora.jpg"
  }
],

    specialBundles: [
      {
        name: "伊布全套",
        price: 650,

        variants: [
          "伊布",
          "火伊布",
          "雷伊布",
          "水伊布",
          "月伊布",
          "色違月伊布",
          "太陽伊布",
          "冰伊布",
          "葉伊布",
          "仙子伊布",
          "色違仙子伊布"
        ]
      }
    ]
  }
];
