/* Сгенерировано из _src/site.json сборщиком _src/build.py — не редактируйте вручную.
   Цены null = данных нет: на сайте выводится [ADD REAL PRICE]. */
window.SITE_CONFIG = {
  "brand": "Ветслужба СПб",
  "weights": [
    {
      "id": "w1",
      "label": "до 5 кг"
    },
    {
      "id": "w2",
      "label": "5–15 кг"
    },
    {
      "id": "w3",
      "label": "15–30 кг"
    },
    {
      "id": "w4",
      "label": "30–50 кг"
    },
    {
      "id": "w5",
      "label": "более 50 кг"
    }
  ],
  "species": {
    "cat": {
      "label": "Кошки и коты",
      "short": "Кошка",
      "icon": "cat",
      "weights": [
        "w1",
        "w2"
      ]
    },
    "dog": {
      "label": "Собаки",
      "short": "Собака",
      "icon": "dog",
      "weights": [
        "w1",
        "w2",
        "w3",
        "w4",
        "w5"
      ]
    },
    "small": {
      "label": "Грызуны, кролики, хорьки",
      "short": "Грызун или кролик",
      "icon": "rodent",
      "weights": [
        "w1"
      ]
    },
    "bird": {
      "label": "Птицы",
      "short": "Птица",
      "icon": "bird",
      "weights": [
        "w1"
      ]
    },
    "exotic": {
      "label": "Рептилии и экзотические животные",
      "short": "Рептилия или экзотика",
      "icon": "turtle",
      "weights": [
        "w1",
        "w2"
      ]
    }
  },
  "services": {
    "euth": {
      "label": "Усыпление на дому",
      "note": "Осмотр, седация, процедура",
      "prices": {
        "w1": 1200,
        "w2": 1600,
        "w3": 1950,
        "w4": 2650,
        "w5": 3300
      }
    },
    "common": {
      "label": "Общая кремация",
      "note": "Без возврата праха",
      "prices": {
        "w1": 1100,
        "w2": 1850,
        "w3": 2650,
        "w4": 4000,
        "w5": 5200
      }
    },
    "individual": {
      "label": "Индивидуальная кремация",
      "note": "С возвратом праха в урне",
      "prices": {
        "w1": 3450,
        "w2": 4050,
        "w3": 4850,
        "w4": 6200,
        "w5": 7600
      }
    }
  },
  "extras": {
    "pickup": {
      "label": "Вывоз тела на кремацию",
      "note": "Если питомец умер дома или в клинике",
      "price": 1550
    },
    "urn": {
      "label": "Урна для праха",
      "note": "Дерево, керамика или пластик",
      "price": 750
    },
    "delivery": {
      "label": "Доставка урны с прахом",
      "note": "По вашему адресу",
      "price": 0
    },
    "report": {
      "label": "Фото- и видеоотчёт",
      "note": "Для индивидуальной кремации; на флешке, по почте или в мессенджер",
      "price": 1550
    }
  },
  "zones": [
    {
      "id": "z1",
      "label": "Город",
      "note": "В пределах КАД",
      "price": 0,
      "color": "#2866a0"
    },
    {
      "id": "z2",
      "label": "Пригород",
      "note": "До 15 км за КАД",
      "price": 1400,
      "color": "#6fb3dc"
    },
    {
      "id": "z3",
      "label": "Дальний выезд",
      "note": "Дальше 15 км, Ленобласть",
      "price": 2800,
      "color": "#e0a865"
    }
  ],
  "formEndpoint": "",
  "analytics": {
    "metrika": ""
  },
  "phone": "+7 931 530-50-26",
  "phoneHref": "+79315305026",
  "whatsappUrl": "https://wa.me/79315305026",
  "telegramUrl": "https://t.me/VetSluzhbaSPB"
};
