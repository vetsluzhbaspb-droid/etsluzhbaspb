#!/usr/bin/env python3
"""Сборка статического сайта «Ветслужба СПб».

Данные компании — в _src/site.json (единственный источник: NAP, цены, зоны,
мессенджеры, аналитика). Пустое значение = данных нет: на сайте выводится
метка [ADD REAL ...], в Schema.org поле не попадает.

Страницы — _src/pages/*.html. Первая строка страницы — JSON с метаданными:
  title, description, nav, crumbs [[подпись, ссылка], ...], type (WebPage/AboutPage/...),
  service {name, serviceType, description, priceKeys}, article {headline, datePublished}.

Шорткоды:
  {{i:name}}            иконка
  {{part:name}}         общий блок (PARTS)
  {{d:key}}             данные компании (phone, hours, city, area, email, experience, duration, legal, address)
  {{price:key}}         «от N ₽» по услуге/доп. услуге или метка [ADD REAL PRICE]
  {{prices:mode:group}} таблица цен (mode: all|euth|cremation; group: all|cat|dog|other)
  {{faq:k1,k2,...}}     блок вопросов (попадает и в FAQPage-разметку)
  {{cta:текст}}         полоса с призывом к действию
  {{crumbs}}            хлебные крошки (+ BreadcrumbList)
  {{cityIn}}            « в Казани» или пусто

Запуск: python3 _src/build.py  → site/
"""
import html
import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from icons import ICONS, SPRITE, emblem, icon  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "_src"
OUT = Path(os.environ["SITE_OUT"]).resolve() if os.environ.get("SITE_OUT") else ROOT / "site"  # на GitHub собираем прямо в корень репозитория
D = json.loads((SRC / "site.json").read_text(encoding="utf-8"))
ART = json.loads((SRC / "articles.json").read_text(encoding="utf-8")) if (SRC / "articles.json").exists() else []
VER = time.strftime("%Y%m%d%H%M%S")
TODAY = date.today().isoformat()

BRAND = D["brand"]
# Адрес приёма заявок (formEndpoint) разрешаем в Content-Security-Policy, когда он появится
from urllib.parse import urlsplit as _us
CSP_ENDPOINT = (" " + "{0.scheme}://{0.netloc}".format(_us(D["formEndpoint"]))) if D.get("formEndpoint") else ""
# Заявки через Telegram-бота: ключ и чат из site.json; сайт шлёт сообщение напрямую в api.telegram.org
TG_BOT = D.get("telegramBot") or {}
BOT_MODE = bool(TG_BOT.get("token") and TG_BOT.get("chatId")) and not D["formEndpoint"]
if BOT_MODE:
    CSP_ENDPOINT += " https://api.telegram.org"
TAGLINE = D["tagline"]
SITE_URL = D["siteUrl"].rstrip("/") + "/"
BASE_PATH = "/" + SITE_URL.split("://", 1)[1].split("/", 1)[1] if "/" in SITE_URL.split("://", 1)[1] else "/"
ORG_ID = SITE_URL + "#org"
WEBSITE_ID = SITE_URL + "#website"
NBSP = " "


# --------------------------------------------------------------------------
# Данные и метки-заглушки
# --------------------------------------------------------------------------
HIDE_EMPTY = bool(D.get("hideEmpty"))
FORCE_TOKENS = [False]  # юридические страницы: метки видны всегда, их обязан заполнить владелец
LEGAL_PAGES = {"privacy.html", "soglasie.html"}


def hide():
    """Режим витрины: незаполненные данные не выводятся (hideEmpty в site.json)."""
    return HIDE_EMPTY and not FORCE_TOKENS[0]


def tok(name):
    if hide():
        return ""
    return f'<span class="tk" title="Данные не заполнены: укажите в _src/site.json">[ADD REAL {name}]</span>'


def has(v):
    return bool(v) and (not isinstance(v, (list, dict)) or any(has(x) for x in (v.values() if isinstance(v, dict) else v)))


def rub(n):
    return f"{n:,}".replace(",", NBSP) + NBSP + "₽"


def digits(s):
    return re.sub(r"\D", "", s or "")


PHONE_HREF = ("+" + digits(D["phone"])) if digits(D["phone"]) else ""
WA_URL = f"https://wa.me/{digits(D['whatsapp'])}" if digits(D["whatsapp"]) else ""
TG_URL = f"https://t.me/{D['telegram'].lstrip('@')}" if D["telegram"] else ""
CITY_IN = (" " + D["cityIn"].strip()) if D["cityIn"].strip() else ""


def address_text():
    a = D["address"]
    parts = [a.get("postalCode"), a.get("region"), a.get("locality"), a.get("street")]
    return ", ".join(p for p in parts if p)


def legal_text():
    l = D["legal"]
    parts = [l.get("name"), f"ИНН {l['inn']}" if l.get("inn") else "", f"ОГРН {l['ogrn']}" if l.get("ogrn") else "", l.get("license")]
    return ", ".join(p for p in parts if p)


def dval(key):
    """HTML-значение данных компании или метка."""
    if key == "phone":
        if not PHONE_HREF and hide():
            return '<a href="kontakty.html">Оставить заявку</a>'
        return f'<a href="tel:{PHONE_HREF}" class="nowrap">{html.escape(D["phone"])}</a>' if PHONE_HREF else tok("PHONE")
    if key == "phone-text":
        if not PHONE_HREF and hide():
            return "Оставить заявку"
        return html.escape(D["phone"]) if PHONE_HREF else tok("PHONE")
    if key == "email":
        return f'<a href="mailto:{html.escape(D["email"])}">{html.escape(D["email"])}</a>' if D["email"] else tok("EMAIL")
    if key == "hours-lower":
        h = D["hours"]
        return html.escape(h[:1].lower() + h[1:]) if h else tok("HOURS")
    if key == "hours":
        return html.escape(D["hours"]) if D["hours"] else tok("HOURS")
    if key == "city":
        return html.escape(D["city"]) if D["city"] else tok("CITY")
    if key == "area-short":
        return html.escape(D.get("serviceAreaShort") or D["serviceArea"]) if (D.get("serviceAreaShort") or D["serviceArea"]) else tok("SERVICE AREA")
    if key == "area-lower":
        a = D["serviceArea"]
        return html.escape(a[:1].lower() + a[1:]) if a else tok("SERVICE AREA")
    if key == "area":
        return html.escape(D["serviceArea"]) if D["serviceArea"] else tok("SERVICE AREA")
    if key == "experience":
        return html.escape(D["experience"]) if D["experience"] else tok("EXPERIENCE")
    if key == "duration":
        return html.escape(D["visitDuration"]) if D["visitDuration"] else tok("DURATION")
    if key == "address":
        return html.escape(address_text()) if address_text() else tok("ADDRESS")
    if key == "site":
        return f'<a href="{SITE_URL}">{SITE_URL}</a>'
    if key == "messengers":
        return messenger_links() or tok("WHATSAPP / TELEGRAM")
    if key == "legal":
        return html.escape(legal_text()) if legal_text() else tok("LEGAL INFO")
    raise KeyError(key)


def min_price(key):
    if key in D["services"]:
        vals = [v for v in D["services"][key]["prices"].values() if isinstance(v, (int, float))]
        return min(vals) if vals else None
    if key in D["extras"]:
        v = D["extras"][key]["price"]
        return v if isinstance(v, (int, float)) else None
    raise KeyError(key)


def price_from(key):
    v = min_price(key)
    if v is None:
        return tok("PRICE")
    if v == 0:
        return "бесплатно"
    return "от " + rub(v)


def price_cell(v):
    if not isinstance(v, (int, float)):
        return tok("PRICE")
    return "бесплатно" if v == 0 else "от " + rub(v)


# --------------------------------------------------------------------------
# Контакты: телефон, мессенджеры
# --------------------------------------------------------------------------
def messenger_links(cls="chip"):
    out = []
    if WA_URL:
        out.append(f'<a class="{cls} msg-wa" href="{WA_URL}" target="_blank" rel="noopener" data-track="whatsapp_click">{icon("whatsapp")}WhatsApp</a>')
    if TG_URL:
        out.append(f'<a class="{cls} msg-tg" href="{TG_URL}" target="_blank" rel="noopener" data-track="telegram_click">{icon("telegram")}Telegram</a>')
    return "".join(out)


def phone_block_header():
    if PHONE_HREF:
        inner = f'<span class="topbar__phone-ico">{icon("phone")}</span><span class="topbar__phone-num">{dval("phone-text")}<small>{dval("hours")}</small></span>'
        return f'<a class="topbar__phone" href="tel:{PHONE_HREF}">{inner}</a>'
    # Телефона нет: показываем часы работы, а не надпись «Оставить заявку» со значком трубки
    return f'<div class="topbar__phone topbar__phone--hours"><span class="topbar__phone-ico">{icon("clock")}</span><span class="topbar__phone-num">{dval("hours")}<small>Выезд на дом</small></span></div>'


# --------------------------------------------------------------------------
# Навигация
# --------------------------------------------------------------------------
NAV = [
    {"id": "usyplenie", "label": "Усыпление", "href": "usyplenie.html",
     "cols": [("По видам питомцев", [("cat", "Кошки и коты", "usyplenie-koshek.html"), ("dog", "Собаки", "usyplenie-sobak.html"), ("rodent", "Грызуны, кролики, хорьки", "usyplenie.html#gryzuny"), ("bird", "Птицы и экзотика", "usyplenie.html#pticy")]),
              ("Перед визитом", [("info", "Когда обсуждают эвтаназию", "usyplenie.html#kogda"), ("steth", "Как проходит визит врача", "usyplenie.html#vizit"), ("home", "Как подготовиться", "usyplenie.html#podgotovka"), ("book", "Памятка: подготовка к визиту", "stati-podgotovka.html")])],
     "promo": ("Стоимость усыпления", "Цена зависит от вида и веса питомца. Посмотрите прайс или соберите расчёт в калькуляторе.", [("ceny.html#prajs", "Смотреть цены"), ("ceny.html#kalkulyator", "Калькулятор")])},
    {"id": "kremaciya", "label": "Кремация", "href": "kremaciya.html",
     "cols": [("Форматы", [("urn", "Индивидуальная кремация", "kremaciya.html#individualnaya"), ("flame", "Общая кремация", "kremaciya.html#obshchaya"), ("doc", "Сравнение форматов", "kremaciya.html#sravnenie"), ("cat", "Кремация кошки", "kremaciya-koshek.html"), ("dog", "Кремация собаки", "kremaciya-sobak.html")]),
              ("Сопутствующие услуги", [("truck", "Вывоз тела животного", "vyvoz.html"), ("urn", "Урны для праха", "kremaciya.html#urny"), ("route", "Доставка урны", "kremaciya.html#urny"), ("camera", "Фото- и видеоотчёт", "kremaciya.html#otchet")])],
     "promo": ("Питомец умер дома?", "Что сделать в первые часы и как организовать вывоз на кремацию.", [("vyvoz.html", "Вывоз тела"), ("stati-pitomec-umer.html", "Памятка")])},
    {"id": "ceny", "label": "Цены", "href": "ceny.html",
     "cols": [("Стоимость", [("doc", "Прайс по видам и весу", "ceny.html#prajs"), ("info", "Что оплачивается отдельно", "ceny.html#otdelno"), ("calc", "Калькулятор стоимости", "ceny.html#kalkulyator"), ("chat", "Вопросы о ценах", "ceny.html#voprosy")])],
     "promo": ("Понятный состав услуг", "Окончательную стоимость ветеринар согласует до начала помощи.", [("tel", "Уточнить условия")])},
    {"id": "o-nas", "label": "О службе", "href": "o-nas.html",
     "cols": [("Служба", [("heart", "Коротко о нас", "o-nas.html#fakty"), ("steth", "Врачи", "o-nas.html#vrachi"), ("shield", "Как мы работаем", "o-nas.html#rabota"), ("map", "Зона выезда", "zona.html")]),
              ("Связь", [("star", "Отзывы", "otzyvy.html"), ("phone", "Контакты", "kontakty.html"), ("lock", "Конфиденциальность", "privacy.html")])],
     "promo": None},
    {"id": "zona", "label": "Зона выезда", "href": "zona.html"},
    {"id": "stati", "label": "Полезное", "href": "stati.html",
     "cols": [("Памятки владельцу", "ARTICLES_NAV"),
              ("Справка", [("book", "Все материалы", "stati.html"), ("chat", "Вопросы и ответы", "faq.html")])],
     "promo": None},
    {"id": "otzyvy", "label": "Отзывы", "href": "otzyvy.html"},
    {"id": "kontakty", "label": "Контакты", "href": "kontakty.html"},
]


for _n in NAV:
    if "cols" in _n:
        _n["cols"] = [(t, [(a.get("icon") or "book", a.get("navTitle") or a["title"], a["file"]) for a in ART[:6]] if links == "ARTICLES_NAV" else links) for t, links in _n["cols"]]

if HIDE_EMPTY:
    for _n in NAV:
        if "cols" in _n:
            _n["cols"] = [(t, [x for x in links if "#vrachi" not in x[2]]) for t, links in _n["cols"]]


def desktop_nav(active):
    items = []
    for n in NAV:
        cur = " is-current" if n["id"] == active else ""
        if "cols" not in n:
            aria = ' aria-current="page"' if n["id"] == active else ""
            items.append(f'<li class="nav__item{cur}"><a class="nav__link" href="{n["href"]}"{aria}>{n["label"]}</a></li>')
            continue
        cols = ""
        for title, links in n["cols"]:
            lis = "".join(f'<li><a href="{h}">{icon(ic)}{t}</a></li>' for ic, t, h in links)
            cols += f'<div class="mega__col"><p class="mega__title">{title}</p><ul>{lis}</ul></div>'
        if n.get("promo"):
            t, p, links = n["promo"]
            btns = "".join(
                (f'<a class="btn btn--primary mega__btn" href="tel:{PHONE_HREF}">{icon("phone")}{l}</a>' if PHONE_HREF
                 else f'<a class="btn btn--primary mega__btn" href="kontakty.html">{icon("phone")}{l}</a>')
                if h == "tel" else f'<a class="link-arrow" href="{h}">{l}{icon("arrow-right")}</a>'
                for h, l in links)
            cols += f'<div class="mega__promo"><strong>{t}</strong><p>{p}</p>{btns}</div>'
        else:
            cols += f'<div class="mega__col"><p class="mega__title">Раздел</p><ul><li><a href="{n["href"]}">{icon("arrow-right")}Весь раздел «{n["label"]}»</a></li></ul></div>'
        items.append(
            f'<li class="nav__item has-mega{cur}"><button class="nav__link" type="button" aria-expanded="false" aria-controls="mega-{n["id"]}">{n["label"]}{icon("chev", "icon chev")}</button>'
            f'<div class="mega" id="mega-{n["id"]}"><div class="container mega__inner" style="--cols:{len(n["cols"]) + 1}">{cols}</div></div></li>'
        )
    return "".join(items)


def mobile_nav():
    items = []
    for n in NAV:
        if "cols" not in n:
            items.append(f'<li><a class="m-nav__link" href="{n["href"]}">{n["label"]}</a></li>')
            continue
        sub = f'<li><a href="{n["href"]}"><strong>Весь раздел «{n["label"]}»</strong></a></li>'
        for title, links in n["cols"]:
            sub += f'<li class="m-nav__group">{title}</li>' + "".join(f'<li><a href="{h}">{t}</a></li>' for _, t, h in links)
        items.append(
            f'<li><button class="m-nav__link" type="button" aria-expanded="false" aria-controls="m-{n["id"]}">{n["label"]}{icon("chev", "icon chev")}</button>'
            f'<ul class="m-nav__sub" id="m-{n["id"]}" hidden>{sub}</ul></li>'
        )
    return "".join(items)


def brand(uid, href="index.html"):
    return f'<a class="brand" href="{href}" aria-label="{BRAND} — на главную">{emblem(uid)}<span class="brand__text"><span class="brand__name">{BRAND}</span><span class="brand__tag">{TAGLINE}</span></span></a>'


def header(active):
    call_mobile = (f'<a class="btn btn--primary btn--block" href="tel:{PHONE_HREF}">{icon("phone")}Позвонить: {html.escape(D["phone"])}</a>' if PHONE_HREF
                   else f'<button class="btn btn--primary btn--block" type="button" data-open="callback" data-topic="Консультация">{icon("chat")}Оставить заявку</button>')
    return f'''<a class="skip-link" href="#main">Перейти к содержимому</a>
<header class="site-header">
  <div class="container topbar">
    {brand("h")}
    <div class="topbar__region">{icon("pin")}<span><strong>{dval("city")}</strong>{dval("area")}</span></div>
    <span class="topbar__spacer"></span>
    {phone_block_header()}
    <button class="btn btn--primary btn--sm topbar__cta" type="button" data-open="callback" data-topic="Усыпление на дому">{icon("chat")}Вызвать врача</button>
    <button class="icon-btn icon-btn--primary topbar__chat" type="button" data-open="callback" data-topic="Усыпление на дому" aria-label="Оставить заявку">{icon("chat")}</button>
    <button class="icon-btn topbar__burger" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Открыть меню">{icon("menu")}</button>
  </div>
  <nav class="navbar" aria-label="Основное меню">
    <div class="container nav">
      <ul class="nav__list">{desktop_nav(active)}</ul>
      <button class="nav__search" type="button" data-open="search" aria-label="Поиск по сайту">{icon("search")}</button>
    </div>
  </nav>
</header>
<div class="nav-backdrop" aria-hidden="true"></div>
<div class="mobile-menu" id="mobile-menu">
  <nav aria-label="Мобильное меню"><ul class="m-nav">{mobile_nav()}
    <li><button class="m-nav__link" type="button" data-open="search">Поиск по сайту{icon("search")}</button></li></ul></nav>
  <div class="mobile-menu__contacts">
    {call_mobile}
    <div class="chip-row">{messenger_links()}</div>
    <p class="small muted">{icon("clock")} {dval("hours")} · {dval("area")}</p>
  </div>
</div>'''


FOOTER_COLS = [
    ("Услуги", [("Усыпление на дому", "usyplenie.html"), ("Усыпление кошек", "usyplenie-koshek.html"), ("Усыпление собак", "usyplenie-sobak.html"), ("Кремация животных", "kremaciya.html"), ("Кремация кошек", "kremaciya-koshek.html"), ("Кремация собак", "kremaciya-sobak.html"), ("Вывоз тела", "vyvoz.html"), ("Урны для праха", "kremaciya.html#urny")]),
    ("Служба", [("О службе", "o-nas.html")] + ([] if HIDE_EMPTY else [("Врачи", "o-nas.html#vrachi")]) + [("Цены", "ceny.html"), ("Калькулятор", "ceny.html#kalkulyator"), ("Зона выезда", "zona.html"), ("Отзывы", "otzyvy.html")]),
    ("Информация", [("Полезное", "stati.html"), ("Вопросы и ответы", "faq.html"), ("Контакты", "kontakty.html"), ("Обработка данных", "privacy.html"), ("Согласие на обработку", "soglasie.html")]),
]


def footer():
    cols = "".join(
        f'<div><p class="footer__title">{t}</p><ul>' + "".join(f'<li><a href="{h}">{l}</a></li>' for l, h in links) + "</ul></div>"
        for t, links in FOOTER_COLS
    )
    fab = ""
    if WA_URL:
        fab = f'<a class="fab fab--wa" href="{WA_URL}" target="_blank" rel="noopener" data-track="whatsapp_click" aria-label="Написать в WhatsApp">{icon("whatsapp")}<span>WhatsApp</span></a>'
    elif TG_URL:
        fab = f'<a class="fab fab--tg" href="{TG_URL}" target="_blank" rel="noopener" data-track="telegram_click" aria-label="Написать в Telegram">{icon("telegram")}<span>Telegram</span></a>'
    else:
        fab = f'<button class="fab" type="button" data-open="callback" data-topic="Консультация">{icon("chat")}<span>Написать нам</span></button>'
    cb1 = (f'<a class="btn btn--primary" href="tel:{PHONE_HREF}">{icon("phone")}<span>Позвонить</span></a>' if PHONE_HREF
           else f'<button class="btn btn--primary" type="button" data-open="callback" data-topic="Консультация">{icon("chat")}<span>Оставить заявку</span></button>')
    if WA_URL:
        cb2 = f'<a class="btn btn--wa" href="{WA_URL}" target="_blank" rel="noopener" data-track="whatsapp_click">{icon("whatsapp")}<span>WhatsApp</span></a>'
    elif TG_URL:
        cb2 = f'<a class="btn btn--tg" href="{TG_URL}" target="_blank" rel="noopener" data-track="telegram_click">{icon("telegram")}<span>Telegram</span></a>'
    elif PHONE_HREF:
        cb2 = f'<button class="btn" type="button" data-open="callback" data-topic="Консультация">{icon("chat")}<span>Заявка</span></button>'
    else:
        cb2 = ""
    # Плашка «Позвонить» сбоку: появляется после прокрутки, не раньше чем через 5 секунд (main.js)
    side_call = (f'<a class="side-call" href="tel:{PHONE_HREF}" aria-label="Позвонить: {html.escape(D["phone"])}"><span class="side-call__ico">{icon("phone")}</span>'
                 f'<span class="side-call__txt"><small>Позвонить</small><b>{html.escape(D["phone"])}</b></span></a>\n') if PHONE_HREF else ""
    return f'''<footer class="site-footer">
  <div class="container">
    <div class="footer__top">
      <div class="footer__about">
        {brand("f")}
        <p>Выездная ветеринарная помощь: гуманное усыпление на дому, кремация, вывоз тела, урны и доставка праха.</p>
      </div>
      <nav class="footer__nav" aria-label="Меню в подвале">{cols}</nav>
      <div class="footer__contacts">
        <span class="footer__phone">{dval("phone")}</span>
        <span>{dval("hours")}</span>
        {f'<span>{dval("email")}</span>' if D["email"] or not hide() else ""}
        <span>{icon("pin")} {dval("area")}</span>
        <div class="chip-row">{messenger_links()}</div>
      </div>
    </div>
    <div class="footer__bottom">
      <span>© <span data-year>{date.today().year}</span> {BRAND}. {TAGLINE}.</span>
      <span><a href="privacy.html">Политика конфиденциальности</a> · <a href="soglasie.html">Согласие на обработку данных</a> · <button class="link-btn" type="button" data-cookie-reset>Настроить cookie</button></span>
      <span class="footer__motto">Рядом, когда это важнее всего</span>
    </div>
    <p class="footer__legal">{(dval("legal") + ". ") if legal_text() or not hide() else ""}Информация на сайте носит справочный характер и не является публичной офертой.</p>
  </div>
</footer>
{side_call}{fab}
<div class="callbar">{cb1}{cb2}</div>
<button class="to-top" type="button" aria-label="Наверх">{icon("arrow-up")}</button>'''


# --------------------------------------------------------------------------
# Формы
# --------------------------------------------------------------------------
SERVICES_SELECT = ["Консультация", "Усыпление на дому", "Вывоз тела", "Индивидуальная кремация", "Общая кремация", "Узнать цену", "Другое"]
TIMES = ["Как можно скорее", "Сегодня", "Завтра", "Другое время — обсудим по телефону"]


def form_fields(prefix, topic_default="Консультация", title="Оставить заявку", sub="Перезвоним, ответим на вопросы и согласуем время визита.", name="callback", title_id="", tag="h3"):
    opts = "".join(f'<option{" selected" if t == topic_default else ""}>{t}</option>' for t in SERVICES_SELECT)
    times = "".join(f"<option>{t}</option>" for t in TIMES)
    tid = f' id="{title_id}"' if title_id else ""
    messenger_mode = not D["formEndpoint"] and not BOT_MODE and bool(WA_URL or TG_URL)
    if messenger_mode:
        # Сайт не хранит заявку: текст собирается в браузере и уходит в выбранный мессенджер
        phone_label, phone_req = "Телефон для обратного звонка", ""
        btns = []
        if WA_URL:
            btns.append(f'<button class="btn btn--wa" type="submit" data-send="wa">{icon("whatsapp")}Отправить в WhatsApp</button>')
        if TG_URL:
            btns.append(f'<button class="btn btn--tg" type="submit" data-send="tg">{icon("telegram")}Отправить в Telegram</button>')
        submit_html = '<p class="form-send-title">Куда отправить заявку:</p><div class="form-send">' + "".join(btns) + "</div>"
    else:
        phone_label, phone_req = 'Телефон <span class="req">*</span>', " required"
        submit_html = f'<button class="btn btn--primary btn--block" type="submit">{icon("send")}Отправить заявку</button>'
    return f'''<form class="form-card" data-form="{name}" novalidate>
      <{tag} class="form-card__title"{tid}>{title}</{tag}>
      <p>{sub}</p>
      <div class="form-grid">
        <div class="field"><label for="{prefix}-name">Имя</label><input class="input ym-disable-keys" id="{prefix}-name" name="name" type="text" autocomplete="name" placeholder="Как к вам обращаться"><span class="field__error"></span></div>
        <div class="field"><label for="{prefix}-phone">{phone_label}</label><input class="input ym-disable-keys" id="{prefix}-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__"{phone_req}><span class="field__error" aria-live="polite"></span></div>
      </div>
      <input type="hidden" name="topic" value="{html.escape(topic_default)}">
      <input type="hidden" name="details" value="">
      <p class="form-details" hidden></p>
      <label class="consent"><input type="checkbox" name="consent" id="{prefix}-consent" value="yes"><span>Даю <a href="soglasie.html" target="_blank" rel="noopener">согласие на обработку персональных данных</a></span></label>
      <p class="form-note">Как мы обращаемся с данными — в <a href="privacy.html" target="_blank" rel="noopener">политике обработки персональных данных</a>.</p>
      {submit_html}
      <div class="form-status" role="status" hidden></div>
    </form>'''


def modals():
    return f'''<dialog class="modal" id="callback-modal" aria-labelledby="cbm-title">
  <div style="position:relative">
    {form_fields("cbm", title="Оставьте заявку", sub="Перезвоним, спокойно всё обсудим и подберём время визита.", name="modal", title_id="cbm-title", tag="h2")}
    <button class="icon-btn modal__close" type="button" data-close aria-label="Закрыть">{icon("close")}</button>
  </div>
</dialog>
<dialog class="modal search-modal" id="search-modal" aria-label="Поиск по сайту">
  <div class="search-box">
    <div class="search-box__field">{icon("search")}<label class="sr-only" for="search-input">Что найти</label><input id="search-input" type="search" placeholder="Например: кремация, цены, кошка" autocomplete="off"><button class="icon-btn" type="button" data-close aria-label="Закрыть поиск">{icon("close")}</button></div>
    <ul class="search-results" id="search-results"></ul>
  </div>
</dialog>
<div class="cookie" id="cookie" hidden>
  <p>С вашего согласия подключим Яндекс Метрику: cookie, IP-адрес и просмотренные страницы — для статистики сайта, данные хранятся в России. Изменить выбор можно внизу страницы. <a href="privacy.html#pravo">Подробнее</a></p>
  <div class="btn-row"><button class="btn btn--primary btn--sm" type="button" data-consent="yes">Принять</button><button class="btn btn--sm" type="button" data-consent="no">Отказаться</button></div>
</div>'''


# --------------------------------------------------------------------------
# Общие блоки
# --------------------------------------------------------------------------
def contact_buttons():
    out = [f'<button class="btn btn--primary" type="button" data-open="callback" data-topic="Усыпление на дому">{icon("chat")}Оставить заявку</button>']
    if PHONE_HREF:
        out.append(f'<a class="btn" href="tel:{PHONE_HREF}">{icon("phone")}Позвонить</a>')
    if WA_URL:
        out.append(f'<a class="btn btn--wa" href="{WA_URL}" target="_blank" rel="noopener" data-track="whatsapp_click">{icon("whatsapp")}WhatsApp</a>')
    if TG_URL:
        out.append(f'<a class="btn btn--tg" href="{TG_URL}" target="_blank" rel="noopener" data-track="telegram_click">{icon("telegram")}Telegram</a>')
    return "".join(out)


def cta_strip(text):
    return f'<div class="cta-strip"><p>{text}</p><div class="btn-row">{contact_buttons()}</div></div>'


def cta_section(title="Можно начать с разговора", text="Не нужно заранее знать, какая услуга нужна. Расскажите о ситуации — объясним варианты и порядок визита, без давления и спешки."):
    if PHONE_HREF:
        phone_inner = f'<span class="cta__phone-ico">{icon("phone")}</span><span class="cta__phone-num">{dval("phone-text")}<small>{dval("hours")}</small></span>'
        phone = f'<a class="cta__phone" href="tel:{PHONE_HREF}">{phone_inner}</a>'
    else:
        phone = f'<div class="cta__phone cta__phone--hours"><span class="cta__phone-ico">{icon("clock")}</span><span class="cta__phone-num">{dval("hours")}<small>Время работы</small></span></div>'
    return f'''<section class="section section--tight" id="svyaz">
  <div class="container">
    <div class="cta">
      <div class="cta__text">
        <span class="eyebrow">Мы на связи</span>
        <h2>{title}</h2>
        <p class="lead">{text}</p>
        {phone}
        <div class="chip-row">{messenger_links()}</div>
        <ul class="cta__facts">
          <li>{icon("pin")}<span>Зона выезда:<br>{dval("area")}</span></li>
          <li>{icon("doc")}<span>Стоимость — до<br>начала работы</span></li>
        </ul>
      </div>
      {form_fields("cta")}
    </div>
  </div>
</section>'''


def calc_section():
    return f'''<section class="section" id="kalkulyator">
  <div class="container">
    <div class="section-head"><div class="section-head__text"><span class="eyebrow">Без телефона и регистрации</span><h2>Быстрый расчёт и запрос цены</h2><p class="lead">Ответьте на четыре вопроса — покажем, из чего складывается стоимость, и отправим расчёт нам одним нажатием.</p></div></div>
    <div class="calc-mount" data-calc><noscript><p class="panel">Калькулятор работает при включённом JavaScript. Цены — в таблице на этой странице, точную сумму назовём по телефону.</p></noscript></div>
  </div>
</section>'''


TAB_GROUPS = [("cat", "Кошки", "cat", ["cat"]), ("dog", "Собаки", "dog", ["dog"]), ("other", "Другие животные", "paw", ["small", "bird", "exotic"])]
_tab_counter = [0]


def price_tables(mode="all", group="all"):
    cols = {"euth": ["euth"], "cremation": ["common", "individual"]}.get(mode, ["euth", "common", "individual"])
    groups = [g for g in TAB_GROUPS if group == "all" or g[0] == group]
    _tab_counter[0] += 1
    uid = f"pt{_tab_counter[0]}"
    out = ""
    if len(groups) > 1:
        out += '<div class="tabs" role="tablist" aria-label="Вид питомца">' + "".join(
            f'<button class="tab" role="tab" type="button" id="{uid}-t{i}" aria-controls="{uid}-p{i}" aria-selected="{"true" if i == 0 else "false"}" tabindex="{0 if i == 0 else -1}">{icon(ic)}{label}</button>'
            for i, (_, label, ic, _sp) in enumerate(groups)) + "</div>"
    for i, (gid, label, ic, sp_ids) in enumerate(groups):
        rows = ""
        for sid in sp_ids:
            sp = D["species"][sid]
            for wid in sp["weights"]:
                w = next(x for x in D["weights"] if x["id"] == wid)
                name = w["label"] if len(sp_ids) == 1 else sp["label"] + (", " + w["label"] if len(sp["weights"]) > 1 else "")
                rows += f'<tr><th scope="row">{html.escape(name)}</th>' + "".join(f'<td data-label="{D["services"][c]["label"]}">{price_cell(D["services"][c]["prices"][wid])}</td>' for c in cols) + "</tr>"
        if mode != "euth":
            rows += f'<tr class="row-sep"><th scope="row">{D["extras"]["pickup"]["label"]}</th><td colspan="{len(cols)}">{price_cell(D["extras"]["pickup"]["price"])}</td></tr>'
        rows += f'<tr><th scope="row">Выезд за город</th><td colspan="{len(cols)}">доплата по зоне · <a href="zona.html">зоны выезда</a></td></tr>'
        head = "".join(f'<th scope="col">{D["services"][c]["label"]}<br><small>{D["services"][c]["note"]}</small></th>' for c in cols)
        role = f' role="tabpanel" id="{uid}-p{i}" aria-labelledby="{uid}-t{i}"' if len(groups) > 1 else ""
        hidden = " hidden" if i > 0 else ""
        caption = f'<caption class="sr-only">Цены: {label.lower()}</caption>'
        out += f'<div class="table-wrap"{role}{hidden}><table class="price-table">{caption}<thead><tr><th scope="col">{"Вес питомца" if len(sp_ids) == 1 else "Питомец"}</th>{head}</tr></thead><tbody>{rows}</tbody></table></div>'
    return f'<div class="price-tables" data-price-tabs>{out}</div>'


def prices_panel(title="Цена зависит от вида и веса питомца", sub="Основные услуги в одной таблице. Выезд за город, урна и доставка считаются отдельно.", mode="all", group="all", id_="prajs"):
    return f'''<section class="section" id="{id_}">
  <div class="container">
    <div class="prices-panel">
      <div class="prices-panel__main">
        <div class="section-head__text"><h2>{title}</h2><p class="muted">{sub}</p></div>
        {price_tables(mode, group)}
        <p class="prices-note">Окончательную стоимость врач подтверждает до начала работы. Если на месте понадобится что-то сверх согласованного, сначала спросим вас.</p>
        <p class="prices-links">Подробнее: <a href="usyplenie-koshek.html">усыпление кошки</a> · <a href="usyplenie-sobak.html">усыпление собаки</a> · <a href="kremaciya-koshek.html">кремация кошки</a> · <a href="kremaciya-sobak.html">кремация собаки</a></p>
      </div>
      <a class="calc-teaser" href="ceny.html#kalkulyator">
        <span class="calc-teaser__ico">{icon("calc")}</span>
        <strong>Узнать точную цену</strong>
        <span>Расчёт за 4 шага и запрос стоимости</span>
        <span class="round-arrow">{icon("arrow-right")}</span>
      </a>
    </div>
  </div>
</section>'''


def team_cards(n=4):
    silhouette = '<svg viewBox="0 0 120 130" aria-hidden="true"><circle cx="60" cy="46" r="26" fill="currentColor"/><path d="M12 130c0-30 21.5-50 48-50s48 20 48 50z" fill="currentColor"/></svg>'
    card = f'''<article class="doc">
      <div class="doc__photo">{silhouette}<span class="doc__photo-label">[ADD REAL PHOTO]</span></div>
      <div class="doc__body">
        <h3 class="doc__name">{tok("NAME")}</h3>
        <span class="doc__role">Ветеринарный врач</span>
        <p class="doc__text">Образование, стаж, специализация: {tok("EXPERIENCE")}</p>
      </div>
    </article>'''
    return '<div class="team">' + card * n + "</div>"


# Оформление — _src/theme.json (цвета, размеры текста, скругления; редактирует админка)
def theme_css():
    f = SRC / "theme.json"
    if not f.exists():
        return ""
    t = json.loads(f.read_text(encoding="utf-8"))
    hexok = lambda v: isinstance(v, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", v)
    v = []
    for key, var in [("primary", "--primary"), ("primary2", "--primary-2"), ("accent", "--warm"), ("text", "--ink"), ("heading", "--heading"), ("muted", "--muted"), ("tint", "--tint-2"), ("bg", "--bg")]:
        if hexok(t.get(key)):
            v.append(f"{var}:{t[key]}")
    if hexok(t.get("primary")):
        v.append(f"--btn-shadow:0 10px 24px {t['primary']}38")
    hs = float(t.get("headingScale") or 100) / 100
    if hs != 1:
        v += [f"--fs-h1:calc(clamp(2rem, 1.35rem + 2.4vw, 3rem) * {hs:.2f})", f"--fs-h2:calc(clamp(1.6rem, 1.2rem + 1.4vw, 2.25rem) * {hs:.2f})", f"--fs-h3:calc(1.2rem * {hs:.2f})"]
    if t.get("radius") not in (None, ""):
        r = max(0, min(40, int(t["radius"])))
        v += [f"--radius:{r}px", f"--radius-sm:{round(r * 0.64)}px"]
    css = (":root{" + ";".join(v) + "}") if v else ""
    ts = float(t.get("textScale") or 100)
    if ts != 100:
        css += f"html{{font-size:{ts:.0f}%}}body{{font-size:{16 * ts / 100:.1f}px}}"
    return f"<style>{css}</style>\n" if css else ""


THEME_CSS = theme_css()


# Статьи — в _src/articles.json (их редактирует админка). Порядок = порядок на сайте.
ARTICLES = [(a["file"], a.get("icon") or "book", a.get("cat") or "posle", a.get("label", ""), a["title"], a.get("desc", "")) for a in ART]
ARTICLE_META = {a["file"]: a for a in ART}


def article_cards(items=None, with_cat=False):
    out = ""
    for href, ic, cat, label, title, desc in items or ARTICLES[:3]:
        dc = f' data-cat="{cat}"' if with_cat else ""
        img = ARTICLE_META.get(href, {}).get("img")
        media = (f'<img class="article-card__img" src="{html.escape(img)}" width="640" height="480" alt="{html.escape(ARTICLE_META[href].get("alt", ""))}" loading="lazy" decoding="async">'
                 if img else f'<span class="article-card__ico">{icon(ic)}</span>')
        mod = " article-card--media" if img else ""
        out += f'''<a class="article-card{mod}" href="{href}"{dc}>
        {media}
        <span class="article-card__body"><span class="eyebrow">{label}</span><span class="article-card__title">{title}</span><span class="article-card__desc">{desc}</span><span class="link-arrow">Читать{icon("arrow-right")}</span></span>
      </a>'''
    return out


def zone_map_svg():
    zones = list(reversed(D["zones"]))
    radii = [140, 100, 60, 40]
    rings, labels = "", ""
    for i, z in enumerate(zones):
        r = radii[i] if i < len(radii) else 30
        rings += f'<circle cx="200" cy="155" r="{r}" fill="{z["color"]}" fill-opacity="0.28" stroke="{z["color"]}" stroke-width="1.5"/>'
        if i < len(zones) - 1:
            labels += f'<text x="200" y="{155 - r + 18}" text-anchor="middle" font-size="14" font-weight="600" fill="#56718a">{html.escape(z["label"])}</text>'
    city = html.escape(D["city"]) if D["city"] else "Город"
    return (f'<svg viewBox="0 0 400 310" role="img" aria-label="Схема зон выезда от центра города к пригородам">'
            f'<g stroke="#e0edf5" stroke-width="2" fill="none"><path d="M20 230 C 120 190, 160 170, 200 155 S 320 90, 390 60"/><path d="M60 30 C 120 90, 170 130, 200 155 S 260 250, 300 300"/><path d="M0 155 H400"/></g>'
            f'{rings}{labels}<g transform="translate(200 147)"><circle r="15" fill="#fff"/><path d="M0 9s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" fill="#2866a0"/><circle cy="-2" r="2.6" fill="#fff"/></g>'
            f'<text x="200" y="182" text-anchor="middle" font-size="15" font-weight="700" fill="#143b5b" stroke="#fff" stroke-width="3" paint-order="stroke">{city}</text></svg>')


def zone_block(heading="h2"):
    rows = ""
    for z in D["zones"]:
        note = html.escape(z["note"]) if z["note"] else tok("SERVICE AREA")
        price = ("без доплаты" if z["price"] == 0 else "доплата от " + rub(z["price"])) if isinstance(z["price"], (int, float)) else "доплата: " + tok("PRICE")
        rows += f'<div class="zone__row"><span class="zone__row-name"><span class="zone__dot" style="background:{z["color"]}"></span>{html.escape(z["label"])}</span><span class="zone__row-note">{note}<br>{price}</span></div>'
    return f'''<div class="zone">
      <div class="zone__text">
        <span class="eyebrow">Территория выезда</span>
        <{heading}>Зона выезда: {dval("city")}</{heading}>
        <p class="muted">Где работаем: {dval("area-lower")}. Назовите адрес — оператор скажет, когда врач сможет приехать и нужна ли доплата за выезд.</p>
        <div class="zone__list">{rows}</div>
      </div>
      <div class="zone__map">
        {zone_map_svg()}
        <p class="zone__map-caption">{icon("info")} Схема условная. Точную зону и доплату назовём при оформлении заявки.</p>
      </div>
    </div>'''


def contact_line():
    """Строка под кнопками на первом экране: телефон и часы или только часы."""
    if PHONE_HREF:
        return f'<p class="hero__contact">{icon("phone")} {dval("phone")} <span class="muted nowrap">· {dval("hours")}</span></p>'
    return f'<p class="hero__contact">{icon("clock")} <span class="muted">{dval("hours")}</span></p>'


def facts_block(heading="h2"):
    """Блок «Коротко о службе»: ясные факты для людей и AI-систем."""
    contacts = []
    if PHONE_HREF or not hide():
        contacts.append(f"телефон {dval('phone')}")
    if WA_URL:
        contacts.append(f'<a href="{WA_URL}" data-track="whatsapp_click" target="_blank" rel="noopener">WhatsApp</a>')
    if TG_URL:
        contacts.append(f'<a href="{TG_URL}" data-track="telegram_click" target="_blank" rel="noopener">Telegram</a>')
    contacts.append('<a href="kontakty.html">форма заявки</a>')
    rows = [
        ("Кто мы", f"«{BRAND}» — выездная ветеринарная служба. Врачи приезжают к питомцу домой. <a href=\"o-nas.html\">Подробнее о службе</a>."),
        ("Услуги", 'Гуманное <a href="usyplenie.html">усыпление животных на дому</a> по медицинским показаниям, <a href="kremaciya.html">общая и индивидуальная кремация</a>, <a href="vyvoz.html">вывоз тела</a>, урны и доставка праха.'),
        ("Для кого", "Владельцы кошек, собак, грызунов, кроликов, хорьков, птиц и рептилий."),
        ("Где работаем", dval("area")),
        ("Часы работы", dval("hours")),
        ("Цены", f'Усыпление на дому — {price_from("euth")}, общая кремация — {price_from("common")}, индивидуальная — {price_from("individual")}. <a href="ceny.html">Полный прайс</a>.'),
        ("Опыт", dval("experience")),
        ("Как связаться", ", ".join(contacts) + "."),
    ]
    if not D["experience"] and hide():
        rows = [r for r in rows if r[0] != "Опыт"]
    dl = "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in rows)
    return f'''<div class="facts">
      <{heading} class="facts__title">Коротко о службе</{heading}>
      <dl class="facts__list">{dl}</dl>
    </div>'''


def districts_block():
    def chips(lst, name):
        if not lst:
            return f'<p>{tok(name)}</p>'
        return '<div class="chip-row">' + "".join(f'<span class="chip">{icon("pin")}{html.escape(x)}</span>' for x in lst) + "</div>"
    return (f'<div class="grid grid-2"><div class="panel"><h3>Город: {dval("city")}</h3>{chips(D["districts"]["city"], "DISTRICTS")}</div>'
            f'<div class="panel"><h3>Пригороды</h3>{chips(D["districts"]["suburbs"], "SUBURBS")}</div></div>')


# Отзывы — _src/reviews.json (добавляются через админку, только реальные и с согласия автора)
REVIEWS = [r for r in (json.loads((SRC / "reviews.json").read_text(encoding="utf-8")) if (SRC / "reviews.json").exists() else [])
           if r.get("consent") and r.get("text", "").strip() and r.get("name", "").strip()]
REVIEW_SOURCES = {"site": "", "yandex": "Яндекс Карты", "twogis": "2ГИС", "google": "Google Карты", "avito": "Авито", "whatsapp": "WhatsApp", "telegram": "Telegram", "vk": "ВКонтакте"}
MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]


def review_date(d):
    m = re.fullmatch(r"(\d{4})-(\d{2})(?:-\d{2})?", d or "")
    return f"{MONTHS[int(m.group(2)) - 1].capitalize()} {m.group(1)}" if m and 1 <= int(m.group(2)) <= 12 else (d or "")


def review_cards(n=None):
    if not REVIEWS:
        card = f'''<article class="review"><div class="review__head"><span class="review__avatar">{icon("user")}</span><span class="review__who"><strong>{tok("NAME")}</strong><small>Отзыв владельца</small></span></div><p class="review__text">{tok("REVIEW")}</p><span class="review__tag">{icon("check")}Публикуется с согласия автора</span></article>'''
        return card * (n or 3)
    out = ""
    for r in REVIEWS[:n] if n else REVIEWS:
        name = html.escape(r["name"].strip())
        meta = " · ".join(x for x in [html.escape(r.get("pet", "").strip()), review_date(r.get("date", "")), REVIEW_SOURCES.get(r.get("source", ""), "")] if x)
        text = "".join(f"<p>{html.escape(par.strip())}</p>" for par in r["text"].split("\n") if par.strip())
        try:
            rating = max(0, min(5, int(r.get("rating") or 0)))
        except (TypeError, ValueError):
            rating = 0
        stars = (f'<span class="review__stars" aria-label="Оценка {rating} из 5">' + "★" * rating + f'<span>{"★" * (5 - rating)}</span></span>') if rating else ""
        link = r.get("link", "").strip()
        src = (f'<a class="review__tag" href="{html.escape(link)}" target="_blank" rel="noopener nofollow">{icon("check")}Оригинал отзыва</a>' if link.startswith("http")
               else f'<span class="review__tag">{icon("check")}Опубликован с согласия автора</span>')
        out += f'''<article class="review review--real"><div class="review__head"><span class="review__avatar">{name[:1].upper()}</span><span class="review__who"><strong>{name}</strong><small>{meta or "Отзыв владельца"}</small></span></div>{stars}<div class="review__text">{text}</div>{src}</article>'''
    return out


def review_links():
    names = {"yandex": "Яндекс Картах", "google": "Google Картах", "twogis": "2ГИС"}
    links = [f'<a class="btn" href="{html.escape(u)}" target="_blank" rel="noopener">{icon("star")}Отзыв на {names[k]}</a>' for k, u in D["reviewLinks"].items() if u]
    if not links:
        if hide():
            return ""
        return f'<p class="muted small">Ссылки на карточки в Яндекс Картах, Google Картах и 2ГИС: {tok("REVIEW LINKS")}</p>'
    return '<div class="btn-row">' + "".join(links) + "</div>"


# --------------------------------------------------------------------------
# Вопросы и ответы
# --------------------------------------------------------------------------
FAQ = {
    "vkljuchaet": ("Что входит в усыпление на дому?", "<p>Осмотр питомца и разговор с вами, седация (животное засыпает), основной этап процедуры, подтверждение врачом остановки сердца и время на прощание. Вывоз тела и кремация — отдельные услуги, их можно заказать вместе с визитом.</p>"),
    "cena": (f"Сколько стоит усыпление на дому{CITY_IN}?", f"<p>Цена зависит от вида и веса питомца: усыпление на дому — {price_from('euth')}. Выезд за пределы города, кремация, урна и доставка считаются отдельно. Полный прайс — на странице <a href=\"ceny.html\">«Цены»</a>, точную сумму оператор назовёт по телефону до выезда.</p>"),
    "kogda": ("Как понять, что пора обсудить эвтаназию?", "<p>Чёткой границы нет. Обычно об этом говорят, когда болезнь неизлечима, а боль и другие тяжёлые симптомы не удаётся облегчить лечением: питомец перестаёт есть, с трудом дышит или встаёт, не радуется привычным вещам.</p><p>Врач осмотрит животное и честно расскажет о вариантах. Решение всегда остаётся за вами.</p>"),
    "osmotr": ("Может ли врач сначала просто осмотреть питомца?", "<p>Да. Визит начинается с осмотра и разговора. Если врач увидит, что питомцу можно помочь лечением или обезболиванием, он скажет об этом. Процедуру проводят только при медицинских показаниях и только с вашего согласия.</p>"),
    "bol": ("Почувствует ли питомец боль?", "<p>Перед основным этапом животному вводят седативный препарат, и оно засыпает. Следующий этап врач начинает, только когда убедится, что питомец в глубоком сне.</p>"),
    "ryadom": ("Можно ли быть рядом во время процедуры?", "<p>Да. Многие владельцы остаются рядом, гладят питомца и говорят с ним. Если вам слишком тяжело, можно выйти в другую комнату. Время попрощаться будет и до процедуры, и после.</p>"),
    "dlitsya": ("Сколько длится визит врача?", f"<p>Обычно визит занимает {dval('duration')}. Мы не торопимся: время нужно на осмотр, разговор, ваши вопросы и прощание.</p>"
                if D["visitDuration"] or not HIDE_EMPTY else
                "<p>Длительность зависит от ситуации — ориентир назовём при звонке. Мы не торопимся: время нужно на осмотр, разговор, ваши вопросы и прощание.</p>"),
    "noch": ("Можно ли вызвать врача срочно, в том числе ночью?", f"<p>Мы работаем {dval('hours-lower')}. Время приезда зависит от адреса и загрузки врачей — оператор назовёт его при звонке.</p>"),
    "kvartira": ("Врач приезжает в квартиру и в частный дом?", "<p>Да. Врач приезжает по адресу, который вы назовёте: в квартиру или частный дом в пределах зоны выезда.</p>"),
    "rayon": ("Выезжаете ли вы в мой район?", f"<p>Зона выезда — {dval('area-lower')}. Назовите адрес — оператор подтвердит выезд и доплату, если она нужна. Подробнее — на странице <a href=\"zona.html\">«Зона выезда»</a>.</p>"),
    "vidy": ("С какими животными вы работаете?", "<p>С кошками и собаками, грызунами, кроликами, хорьками, птицами, рептилиями и другими экзотическими животными. Для экзотических видов уточните при звонке, сможет ли приехать врач с нужным опытом.</p>"),
    "podgotovka": ("Как подготовиться к приезду врача?", "<p>Выберите тихое место, где питомцу привычно, и постелите пелёнку. Подготовьте выписки из клиники, если они есть. Подумайте, будут ли рядом дети и другие животные.</p><p>Подробнее — в <a href=\"stati-podgotovka.html\">памятке о подготовке к визиту</a>.</p>"),
    "umer": ("Что делать, если питомец умер дома?", "<p>Положите тело на пелёнку в прохладном месте и накройте тканью. Позвоните нам или оставьте заявку — организуем <a href=\"vyvoz.html\">вывоз на кремацию</a>.</p><p>Пошагово — в <a href=\"stati-pitomec-umer.html\">памятке для владельцев</a>.</p>"),
    "format": ("Чем общая кремация отличается от индивидуальной?", "<p>При общей кремации животных кремируют вместе, прах владельцу не возвращают. При индивидуальной питомца кремируют отдельно и передают вам прах в урне. Для индивидуальной кремации можно заказать фото- и видеоотчёт.</p>"),
    "prah": ("Когда я получу прах?", "<p>Индивидуальная кремация обычно занимает от 2 до 6 рабочих дней, точный срок указываем в договоре. После этого прах передаём вам в урне — её можно забрать самостоятельно или заказать доставку.</p>"),
    "prisutstvie": ("Можно ли присутствовать при кремации?", "<p>Да, можно. Время согласуем заранее, при оформлении кремации.</p>"),
    "otchet": ("Как я получу фото- и видеоотчёт?", "<p>Как вам удобнее: на флешке или диске, по электронной почте или в мессенджер. Способ выбираете при оформлении индивидуальной кремации.</p>"),
    "urny": ("Какие есть урны?", "<p>Деревянные, керамические и пластиковые. Стоимость конкретной модели назовём при заказе.</p>"),
    "dokumenty": ("Какие документы я получу?", "<p>Состав документов зависит от услуги — уточните его у оператора при звонке. Перечень можно согласовать заранее, если документы нужны для клиники, работы или других целей.</p>"),
    "kontakt-konsult": ("Можно ли сначала просто посоветоваться?", "<p>Да. Расскажите о ситуации по телефону или в заявке — объясним, какие есть варианты и как проходит визит.</p>"),
    "kontakt-registr": ("Нужно ли регистрироваться на сайте?", "<p>Нет. Для заявки достаточно номера телефона, а калькулятор работает без контактов.</p>"),
    "kontakt-dannye": ("Как вы используете мой номер телефона?", "<p>Только чтобы связаться с вами по заявке. Подробнее — в <a href=\"privacy.html\">политике конфиденциальности</a>.</p>"),
}


class Ctx:
    """Контекст сборки одной страницы: собирает вопросы для FAQPage."""
    def __init__(self):
        self.faq = []


def faq_item(key, ctx):
    q, a = FAQ[key]
    ctx.faq.append((q, a))
    return f'<details class="faq-item" id="faq-{key}"><summary>{q}{icon("chev", "icon chev")}</summary><div class="faq-item__body">{a}</div></details>'


def faq_grid(keys, ctx):
    half = (len(keys) + 1) // 2
    cols = [keys[:half], keys[half:]]
    return '<div class="faq">' + "".join('<div class="faq__col">' + "".join(faq_item(k, ctx) for k in col) + "</div>" for col in cols) + "</div>"


def faq_all(ctx):
    groups = [("vizit", "Визит врача", ["vkljuchaet", "kogda", "osmotr", "bol", "ryadom", "dlitsya", "podgotovka", "noch", "kvartira", "rayon", "vidy"]),
              ("kremaciya", "Кремация и прощание", ["format", "prah", "prisutstvie", "otchet", "urny", "umer"]),
              ("stoimost", "Стоимость и документы", ["cena", "dokumenty"])]
    out = ""
    for gid, title, keys in groups:
        out += f'<div class="faq-group" id="{gid}"><h2>{title}</h2><div class="faq faq--single"><div class="faq__col">' + "".join(faq_item(k, ctx) for k in keys) + "</div></div></div>"
    return out


# --------------------------------------------------------------------------
# Schema.org (только реальные данные)
# --------------------------------------------------------------------------
def strip_tags(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def org_node():
    n = {"@type": ["VeterinaryCare", "LocalBusiness"], "@id": ORG_ID, "name": BRAND, "url": SITE_URL,
         "logo": SITE_URL + "assets/img/logo-512.png", "image": SITE_URL + "assets/img/og-image.png",
         "description": "Выездная ветеринарная служба: гуманное усыпление животных на дому по медицинским показаниям, общая и индивидуальная кремация, вывоз тела, урны и доставка праха.",
         "knowsLanguage": "ru"}
    if PHONE_HREF:
        n["telephone"] = PHONE_HREF
        n["contactPoint"] = {"@type": "ContactPoint", "telephone": PHONE_HREF, "contactType": "customer service", "availableLanguage": "ru"}
    if D["email"]:
        n["email"] = D["email"]
    a = D["address"]
    if any(a.values()):
        n["address"] = {"@type": "PostalAddress", "addressCountry": "RU", **{k2: a[k1] for k1, k2 in [("street", "streetAddress"), ("locality", "addressLocality"), ("region", "addressRegion"), ("postalCode", "postalCode")] if a.get(k1)}}
    if D["city"]:
        n["areaServed"] = {"@type": "City", "name": D["city"]}
    if D["openingHoursSchema"]:
        n["openingHours"] = D["openingHoursSchema"]
    allp = [v for s in D["services"].values() for v in s["prices"].values() if isinstance(v, (int, float))]
    if allp:
        n["priceRange"] = f"{min(allp)}–{max(allp)} RUB"
        n["currenciesAccepted"] = "RUB"
    if D["mapUrl"]:
        n["hasMap"] = D["mapUrl"]
    if D["foundingYear"]:
        n["foundingDate"] = D["foundingYear"]
    same = list(D["sameAs"]) + [u for u in D["reviewLinks"].values() if u]
    if same:
        n["sameAs"] = same
    if D["legal"].get("name"):
        n["legalName"] = D["legal"]["name"]
    if D["legal"].get("inn"):
        n["taxID"] = D["legal"]["inn"]
    return n


def website_node():
    return {"@type": "WebSite", "@id": WEBSITE_ID, "url": SITE_URL, "name": BRAND, "inLanguage": "ru-RU", "publisher": {"@id": ORG_ID}}


def page_url(fname):
    return SITE_URL if fname == "index.html" else SITE_URL + fname


def schema_graph(meta, fname, ctx):
    url = page_url(fname)
    graph = [org_node(), website_node()]
    wp = {"@type": meta.get("type", "WebPage"), "@id": url + "#webpage", "url": url, "name": meta["title"], "description": meta["description"],
          "isPartOf": {"@id": WEBSITE_ID}, "about": {"@id": ORG_ID}, "inLanguage": "ru-RU", "dateModified": TODAY}
    crumbs = meta.get("crumbs")
    if crumbs:
        wp["breadcrumb"] = {"@id": url + "#breadcrumb"}
        items = [{"@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL}]
        for i, (label, href) in enumerate(crumbs, start=2):
            items.append({"@type": "ListItem", "position": i, "name": label, "item": page_url(href) if href else url})
        graph.append({"@type": "BreadcrumbList", "@id": url + "#breadcrumb", "itemListElement": items})
    graph.append(wp)
    svc = meta.get("service")
    if svc:
        node = {"@type": "Service", "@id": url + "#service", "name": svc["name"], "serviceType": svc["serviceType"], "description": svc["description"],
                "provider": {"@id": ORG_ID}, "url": url, "availableChannel": {"@type": "ServiceChannel", "serviceUrl": url}}
        if D["city"]:
            node["areaServed"] = {"@type": "City", "name": D["city"]}
        prices = [p for k in svc.get("priceKeys", []) for p in ([min_price(k)] if min_price(k) is not None else [])]
        allp = [v for k in svc.get("priceKeys", []) if k in D["services"] for v in D["services"][k]["prices"].values() if isinstance(v, (int, float))]
        allp += [D["extras"][k]["price"] for k in svc.get("priceKeys", []) if k in D["extras"] and isinstance(D["extras"][k]["price"], (int, float))]
        if allp:
            node["offers"] = {"@type": "AggregateOffer", "priceCurrency": "RUB", "lowPrice": min(allp), "highPrice": max(allp), "url": page_url("ceny.html")}
        graph.append(node)
    art = meta.get("article")
    if art:
        graph.append({"@type": "Article", "@id": url + "#article", "headline": art["headline"], "description": meta["description"],
                      "datePublished": art["datePublished"], "dateModified": TODAY, "inLanguage": "ru-RU",
                      "author": {"@id": ORG_ID}, "publisher": {"@id": ORG_ID}, "mainEntityOfPage": {"@id": url + "#webpage"},
                      "image": SITE_URL + "assets/img/og-image.png"})
    qa = [(q, strip_tags(a)) for q, a in ctx.faq if "[ADD REAL" not in a and "[ADD REAL" not in q]
    if qa:
        graph.append({"@type": "FAQPage", "@id": url + "#faq", "isPartOf": {"@id": url + "#webpage"},
                      "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]})
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":"))


def crumbs_html(meta):
    crumbs = meta.get("crumbs") or []
    items = '<li><a href="index.html">Главная</a></li>'
    for label, href in crumbs:
        items += f'<li><a href="{href}">{label}</a></li>' if href else f'<li aria-current="page">{label}</li>'
    return f'<nav aria-label="Хлебные крошки"><ol class="crumbs">{items}</ol></nav>'


# --------------------------------------------------------------------------
# Страница
# --------------------------------------------------------------------------
PARTS = {
    "cta": lambda: cta_section(),
    "calc": calc_section,
    "prices": lambda: prices_panel(),
    "prices-cremation": lambda: prices_panel(title="Цена кремации зависит от веса", sub="Общая и индивидуальная кремация по видам питомцев. Урна и доставка — отдельно.", mode="cremation"),
    "prices-cat": lambda: prices_panel(title="Цены для кошек", sub="Усыпление на дому и кремация в зависимости от веса.", group="cat", id_="ceny-koshki"),
    "prices-cremation-cat": lambda: prices_panel(title="Цены на кремацию кошки", sub="Общая и индивидуальная кремация в зависимости от веса. Вывоз, урна и доставка — отдельно.", mode="cremation", group="cat", id_="ceny-kremaciya-koshki"),
    "prices-cremation-dog": lambda: prices_panel(title="Цены на кремацию собаки", sub="Общая и индивидуальная кремация в зависимости от веса собаки. Вывоз, урна и доставка — отдельно.", mode="cremation", group="dog", id_="ceny-kremaciya-sobaki"),
    "prices-dog": lambda: prices_panel(title="Цены для собак", sub="Усыпление на дому и кремация в зависимости от веса собаки.", group="dog", id_="ceny-sobaki"),
    "team": team_cards,
    "articles3": lambda: article_cards(),
    "articles-all": lambda: article_cards(ARTICLES, with_cat=True),
    "zone": lambda: zone_block(),
    "zone-h1": lambda: zone_block("h1"),
    "districts": districts_block,
    "facts": lambda: facts_block(),
    "reviews": lambda: review_cards(6),
    "reviews-all": lambda: review_cards(),
    "review-links": review_links,
    "messengers": lambda: f'<div class="chip-row">{messenger_links()}</div>',
    "contact-buttons": lambda: f'<div class="btn-row">{contact_buttons()}</div>',
        "form-contacts": lambda: form_fields("ct"),
    "emblem-big": lambda: emblem("big", 120, "emblem-big"),
    "chev": lambda: icon("chev", "icon chev"),
}


# Страницы без содержания не индексируем, пока нет данных: «Отзывы» без отзывов
NOINDEX = set() if (not HIDE_EMPTY or REVIEWS) else {"otzyvy.html"}

COND = {
    "bot": BOT_MODE, "nobot": not BOT_MODE,
    "team": not HIDE_EMPTY,       # карточек врачей нет в данных — показываем заглушки только в режиме заполнения
    "reviews": bool(REVIEWS) or not HIDE_EMPTY,  # блок отзывов виден, когда есть хотя бы один отзыв
    "phone": bool(PHONE_HREF) or not HIDE_EMPTY,
    "nophone": not PHONE_HREF and HIDE_EMPTY,
    "messengers": bool(WA_URL or TG_URL) or not HIDE_EMPTY,
    "email": bool(D["email"]) or not HIDE_EMPTY,
    "experience": bool(D["experience"]) or not HIDE_EMPTY,
    "legal": bool(legal_text()) or not HIDE_EMPTY,
}


def render(text, meta, ctx):
    text = re.sub(r"<!--if:([a-z]+)-->(.*?)<!--/if:\1-->", lambda m: m.group(2) if COND[m.group(1)] else "", text, flags=re.S)
    text = re.sub(r"\[ADD REAL ([A-Z ]+)\]", lambda m: tok(m.group(1)), text)
    text = re.sub(r"\{\{i:([a-z0-9-]+)\}\}", lambda m: icon(m.group(1)), text)
    text = re.sub(r"\{\{d:([a-z-]+)\}\}", lambda m: dval(m.group(1)), text)
    text = re.sub(r"\{\{price:([a-z]+)\}\}", lambda m: price_from(m.group(1)), text)
    text = re.sub(r"\{\{prices:([a-z]+):([a-z]+)\}\}", lambda m: price_tables(m.group(1), m.group(2)), text)
    text = re.sub(r"\{\{cta:([^}]+)\}\}", lambda m: cta_strip(m.group(1)), text)
    text = text.replace("{{contactline}}", contact_line())
    text = text.replace("{{crumbs}}", crumbs_html(meta)).replace("{{cityIn}}", CITY_IN)
    text = re.sub(r"\{\{part:([a-z0-9-]+)\}\}", lambda m: PARTS[m.group(1)](), text)
    if "{{faq:all}}" in text:
        text = text.replace("{{faq:all}}", faq_all(ctx))
    text = re.sub(r"\{\{faq:([a-z,-]+)\}\}", lambda m: faq_grid(m.group(1).split(","), ctx), text)
    return text


def page(meta, body, fname, ctx):
    title = meta["title"].replace("{cityIn}", CITY_IN)
    meta["title"] = title
    desc = meta["description"].replace("{cityIn}", CITY_IN)
    meta["description"] = desc
    url = page_url(fname)
    is404 = fname == "404.html"
    base = f'<base href="{BASE_PATH}">\n' if is404 else ""
    robots = '<meta name="robots" content="noindex, follow">' if (is404 or fname in NOINDEX) else '<meta name="robots" content="index, follow, max-image-preview:large">'
    canonical = "" if is404 else f'<link rel="canonical" href="{url}">\n<meta property="og:url" content="{url}">'
    verify = ""
    if D["verification"]["google"]:
        verify += f'<meta name="google-site-verification" content="{html.escape(D["verification"]["google"])}">\n'
    if D["verification"]["yandex"]:
        verify += f'<meta name="yandex-verification" content="{html.escape(D["verification"]["yandex"])}">\n'
    service_attr = f' data-service="{meta["service"]["serviceType"]}"' if meta.get("service") else ""
    schema = "" if is404 else f'<script type="application/ld+json">{schema_graph(meta, fname, ctx)}</script>'
    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://mc.yandex.ru https://yastatic.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://mc.yandex.ru; font-src 'self'; connect-src 'self' https://mc.yandex.ru{CSP_ENDPOINT}; frame-src https://mc.yandex.ru; object-src 'none'; base-uri 'self'; form-action 'self'">
<meta name="referrer" content="strict-origin-when-cross-origin">
{base}<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
{robots}
{canonical}
<meta property="og:type" content="{"article" if meta.get("article") else "website"}">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="{BRAND}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:image" content="{SITE_URL}assets/img/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#2866a0">
{verify}<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
<link rel="preload" href="assets/fonts/onest-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/style.css?v={VER}">
{THEME_CSS}<script src="assets/js/config.js?v={VER}" defer></script>
<script src="assets/js/main.js?v={VER}" defer></script>
{schema}
</head>
<body{service_attr}>
{SPRITE}
{header(meta.get("nav", ""))}
<main id="main">
{body}
</main>
{footer()}
{modals()}
</body>
</html>
'''


# --------------------------------------------------------------------------
# Служебные файлы
# --------------------------------------------------------------------------
def write_config_js():
    cfg = {k: D[k] for k in ["brand", "weights", "species", "services", "extras", "zones", "formEndpoint", "analytics"]}
    cfg.update({"phone": D["phone"], "phoneHref": PHONE_HREF, "whatsappUrl": WA_URL, "telegramUrl": TG_URL})
    if BOT_MODE:
        cfg["tgBot"] = {"token": TG_BOT["token"], "chatId": TG_BOT["chatId"]}
    js = ("/* Сгенерировано из _src/site.json сборщиком _src/build.py — не редактируйте вручную.\n"
          "   Цены null = данных нет: на сайте выводится [ADD REAL PRICE]. */\n"
          "window.SITE_CONFIG = " + json.dumps(cfg, ensure_ascii=False, indent=2) + ";\n")
    (OUT / "assets/js/config.js").write_text(js, encoding="utf-8")


def write_seo_files(pages):
    urls = "\n".join(f"  <url><loc>{page_url(p)}</loc><lastmod>{TODAY}</lastmod></url>" for p in pages if p != "404.html" and p not in NOINDEX)
    (OUT / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n', encoding="utf-8")
    host = SITE_URL.split("://", 1)[1].split("/", 1)[0]
    if not host.endswith("github.io"):
        (OUT / "CNAME").write_text(host + "\n", encoding="utf-8")  # свой домен для GitHub Pages
    (OUT / "robots.txt").write_text(
        "# Индексация открыта для поисковых и AI-систем\nUser-agent: *\nAllow: /\nDisallow: /404.html\nDisallow: /admin/\n\n"
        f"Sitemap: {SITE_URL}sitemap.xml\n", encoding="utf-8")
    ph = lambda v, name: v if v else ("" if HIDE_EMPTY else f"[ADD REAL {name}]")
    lines = [f"# {BRAND}", "", f"> {TAGLINE}. Выездная ветеринарная служба: гуманное усыпление животных на дому по медицинским показаниям, общая и индивидуальная кремация, вывоз тела, урны и доставка праха.", "",
             "## Факты", f"- Где работаем: {ph(D['serviceArea'], 'SERVICE AREA')}", f"- Город: {ph(D['city'], 'CITY')}", f"- Часы работы: {ph(D['hours'], 'HOURS')}",
             f"- Телефон: {ph(D['phone'], 'PHONE')}", f"- E-mail: {ph(D['email'], 'EMAIL')}", f"- WhatsApp: {WA_URL or ('' if HIDE_EMPTY else '[ADD REAL WHATSAPP]')}", f"- Telegram: {TG_URL or ('' if HIDE_EMPTY else '[ADD REAL TELEGRAM]')}",
             f"- Цены: усыпление на дому — {('от ' + str(min_price('euth')) + ' ₽') if min_price('euth') else '[ADD REAL PRICE]'}; общая кремация — {('от ' + str(min_price('common')) + ' ₽') if min_price('common') else '[ADD REAL PRICE]'}; индивидуальная кремация — {('от ' + str(min_price('individual')) + ' ₽') if min_price('individual') else '[ADD REAL PRICE]'}",
             "- Животные: кошки, собаки, грызуны, кролики, хорьки, птицы, рептилии", "- Язык: русский", "",
             "## Основные страницы",
             f"- [Усыпление животных на дому]({SITE_URL}usyplenie.html): показания, порядок визита, подготовка, цены",
             f"- [Усыпление кошки на дому]({SITE_URL}usyplenie-koshek.html)", f"- [Усыпление собаки на дому]({SITE_URL}usyplenie-sobak.html)",
             f"- [Кремация животных]({SITE_URL}kremaciya.html): общая и индивидуальная, урны, фото- и видеоотчёт",
             f"- [Кремация кошки]({SITE_URL}kremaciya-koshek.html)", f"- [Кремация собаки]({SITE_URL}kremaciya-sobak.html)",
             f"- [Вывоз тела животного]({SITE_URL}vyvoz.html)", f"- [Цены и калькулятор]({SITE_URL}ceny.html)", f"- [Зона выезда]({SITE_URL}zona.html)",
             f"- [О службе]({SITE_URL}o-nas.html)", f"- [Вопросы и ответы]({SITE_URL}faq.html)", f"- [Контакты]({SITE_URL}kontakty.html)", "",
             "## Памятки владельцам"] + [f"- [{t}]({SITE_URL}{h})" for h, _, _, _, t, _ in ARTICLES]
    if HIDE_EMPTY:
        lines = [l for l in lines if not re.match(r"^- [^:]+: ?$", l)]
    (OUT / "llms.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def unwrap_dead_links(text, existing):
    """Ссылки на удалённые страницы превращаем в обычный текст, чтобы не было битых ссылок."""
    def fix(m):
        return m.group(0) if m.group(1) in existing else m.group(3)
    return re.sub(r'<a\b[^>]*?href="([a-z0-9-]+\.html)(#[^"]*)?"[^>]*>(.*?)</a>', fix, text, flags=re.S)


def main():
    pages = sorted((SRC / "pages").glob("*.html"))
    existing = {p.name for p in pages}
    names = []
    for p in pages:
        raw = p.read_text(encoding="utf-8")
        first, _, body = raw.partition("\n")
        meta = json.loads(first)
        ctx = Ctx()
        FORCE_TOKENS[0] = p.name in LEGAL_PAGES
        body_html = render(body, meta, ctx)
        FORCE_TOKENS[0] = False
        out_html = page(meta, body_html, p.name, ctx)
        if "{{" in out_html:
            raise SystemExit(f"Необработанный шорткод в {p.name}: " + re.search(r"\{\{[^}]*\}\}", out_html).group(0))
        # ссылки на главную ведём на «/», а не на дубль /index.html
        out_html = unwrap_dead_links(out_html, existing)
        out_html = out_html.replace('href="index.html#', 'href="./#').replace('href="index.html"', 'href="./"')
        (OUT / p.name).write_text(out_html, encoding="utf-8")
        names.append(p.name)
        print("✓", p.name)
    write_config_js()
    write_seo_files(names)
    print("✓ config.js, sitemap.xml, robots.txt, llms.txt")


if __name__ == "__main__":
    main()
