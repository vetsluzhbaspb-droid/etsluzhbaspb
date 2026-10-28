/* «Ветслужба СПб» — интерактив сайта. Данные — в config.js (генерируется из _src/site.json).
   Контакты, цены и Schema уже записаны в HTML при сборке; скрипт отвечает только за поведение. */
(function () {
  "use strict";

  var C = window.SITE_CONFIG || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var icon = function (name) { return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; };
  var rub = function (n) { return Number(n).toLocaleString("ru-RU") + " ₽"; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var isNum = function (v) { return typeof v === "number" && isFinite(v); };
  var PH_PRICE = '<span class="tk">[ADD REAL PRICE]</span>';
  var priceHtml = function (v) { return isNum(v) ? (v === 0 ? "бесплатно" : rub(v)) : PH_PRICE; };

  /* ---------- 1. Аналитика: события и загрузка счётчиков после согласия ---------- */
  var A = C.analytics || {};
  var hasAnalytics = !!A.metrika; /* только Яндекс Метрика: данные хранятся в РФ (ч. 5 ст. 18 152-ФЗ) */
  window.dataLayer = window.dataLayer || [];

  function track(event, params) {
    params = params || {};
    params.page_path = location.pathname;
    window.dataLayer.push(Object.assign({ event: event }, params));
    try { if (window.ym && A.metrika) window.ym(Number(A.metrika), "reachGoal", event, params); } catch (e) {}
  }
  window.siteTrack = track;

  function loadScript(src, onload) {
    var s = document.createElement("script"); s.async = true; s.src = src; if (onload) s.onload = onload; document.head.appendChild(s);
  }
  function loadAnalytics() {
    if (A.metrika) {
      window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
      window.ym.l = Date.now();
      loadScript("https://mc.yandex.ru/metrika/tag.js");
      window.ym(Number(A.metrika), "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
    }
  }
  function getConsent() { try { return localStorage.getItem("ms-consent"); } catch (e) { return null; } }
  function setConsent(v) { try { localStorage.setItem("ms-consent", v); } catch (e) {} }

  function initAnalytics() {
    // Уведомление показывается при первом визите, пока посетитель не сделает выбор.
    // Счётчики загружаются только после «Принять» и только если их ID заданы.
    {
      var c = getConsent();
      var banner = $("#cookie");
      if (c === "yes" && hasAnalytics) loadAnalytics();
      else if (c !== "yes" && c !== "no" && banner) {
        banner.hidden = false;
        $$("[data-consent]", banner).forEach(function (b) {
          b.addEventListener("click", function () {
            var v = b.getAttribute("data-consent");
            setConsent(v); banner.hidden = true;
            if (v === "yes" && hasAnalytics) loadAnalytics();
          });
        });
      }
    }
    // «Настроить cookie» в подвале: сбрасывает выбор и снова показывает уведомление
    $$("[data-cookie-reset]").forEach(function (b) {
      b.addEventListener("click", function () {
        var had = getConsent() === "yes";
        try { localStorage.removeItem("ms-consent"); } catch (e) {}
        if (had) { location.reload(); return; }
        var banner = $("#cookie"); if (!banner) return;
        banner.hidden = false;
        $$("[data-consent]", banner).forEach(function (x) {
          x.onclick = function () { var v = x.getAttribute("data-consent"); setConsent(v); banner.hidden = true; if (v === "yes" && hasAnalytics) loadAnalytics(); };
        });
      });
    });
    // Клики по телефону и мессенджерам
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]");
      if (!a) return;
      var href = a.getAttribute("href");
      if (href.indexOf("tel:") === 0) track("phone_click", { link_url: href });
      else if (/wa\.me|whatsapp/i.test(href)) track("whatsapp_click", { link_url: href });
      else if (/t\.me\//i.test(href)) track("telegram_click", { link_url: href });
    });
    // Просмотр страницы услуги
    var svc = document.body.getAttribute("data-service");
    if (svc) track("service_page_view", { service: svc });
  }

  /* ---------- 2. Шапка, мега-меню, мобильное меню ---------- */
  function initHeader() {
    var header = $(".site-header");
    var backdrop = $(".nav-backdrop");
    if (!header) return;
    var setH = function () { document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px"); };
    setH();
    window.addEventListener("resize", setH);

    var items = $$(".nav__item.has-mega");
    var closeTimer = null;
    var closeAll = function () {
      items.forEach(function (it) { it.classList.remove("is-open"); var b = $(".nav__link", it); if (b) b.setAttribute("aria-expanded", "false"); });
      if (backdrop) backdrop.classList.remove("is-visible");
    };
    var open = function (it) {
      clearTimeout(closeTimer);
      items.forEach(function (o) { if (o !== it) { o.classList.remove("is-open"); var ob = $(".nav__link", o); if (ob) ob.setAttribute("aria-expanded", "false"); } });
      it.classList.add("is-open");
      $(".nav__link", it).setAttribute("aria-expanded", "true");
      if (backdrop) backdrop.classList.add("is-visible");
    };
    var canHover = window.matchMedia("(hover: hover)").matches;
    items.forEach(function (it) {
      var btn = $(".nav__link", it);
      btn.addEventListener("click", function (e) {
        // Мышью на десктопе меню уже открыто наведением — клик его не закрывает
        if (canHover && e.detail > 0) { open(it); return; }
        it.classList.contains("is-open") ? closeAll() : open(it);
      });
      if (canHover) {
        it.addEventListener("mouseenter", function () { open(it); });
        it.addEventListener("mouseleave", function () { closeTimer = setTimeout(closeAll, 160); });
      }
    });
    if (backdrop) backdrop.addEventListener("click", closeAll);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(); closeMobile(); } });
    document.addEventListener("click", function (e) { if (!e.target.closest(".nav")) closeAll(); });

    var burger = $(".topbar__burger");
    var menu = $("#mobile-menu");
    function closeMobile() {
      if (!menu || !burger) return;
      menu.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      burger.innerHTML = icon("menu");
      document.body.style.overflow = "";
    }
    if (burger && menu) {
      burger.addEventListener("click", function () {
        var isOpen = menu.classList.toggle("is-open");
        burger.setAttribute("aria-expanded", String(isOpen));
        burger.innerHTML = icon(isOpen ? "close" : "menu");
        document.body.style.overflow = isOpen ? "hidden" : "";
      });
      $$(".m-nav__link[aria-controls]", menu).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var sub = document.getElementById(btn.getAttribute("aria-controls"));
          var exp = btn.getAttribute("aria-expanded") === "true";
          btn.setAttribute("aria-expanded", String(!exp));
          sub.hidden = exp;
        });
      });
      $$("a", menu).forEach(function (a) { a.addEventListener("click", closeMobile); });
      window.addEventListener("resize", function () { if (window.innerWidth > 1024) closeMobile(); });
    }
    window.__closeMobileMenu = closeMobile;
  }

  /* ---------- 3. Вкладки таблиц цен (таблицы уже в HTML) ---------- */
  function initTabs() {
    $$("[data-price-tabs]").forEach(function (root) {
      var tabs = $$("[role=tab]", root);
      var select = function (t) {
        tabs.forEach(function (x) {
          var on = x === t;
          x.setAttribute("aria-selected", String(on));
          x.tabIndex = on ? 0 : -1;
          document.getElementById(x.getAttribute("aria-controls")).hidden = !on;
        });
      };
      tabs.forEach(function (t, i) {
        t.addEventListener("click", function () { select(t); });
        t.addEventListener("keydown", function (e) {
          var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          var next = tabs[(i + d + tabs.length) % tabs.length];
          next.focus(); select(next);
        });
      });
    });
  }

  /* ---------- 4. Калькулятор и быстрый запрос цены ---------- */
  function Calc(root, idx) {
    this.root = root;
    this.uid = "calc" + idx;
    this.state = { step: 1, situation: "vet", species: "cat", weight: "w1", cremation: "individual", pickup: true, urn: true, delivery: false, report: false, zone: (C.zones && C.zones[0] && C.zones[0].id) || "" };
    this.render();
  }
  Calc.prototype.labels = ["Ситуация", "Питомец", "Услуги", "Расчёт"];
  Calc.prototype.render = function () {
    var s = this.state, self = this;
    var steps = '<ol class="calc__steps">' + this.labels.map(function (l, i) {
      var n = i + 1;
      var cls = n === s.step ? "is-active" : n < s.step ? "is-done" : "";
      return '<li class="calc__step ' + cls + '"' + (n === s.step ? ' aria-current="step"' : "") + '><span class="num">' + (n < s.step ? icon("check") : "0" + n) + '</span><span class="label">' + l + "</span></li>";
    }).join("") + "</ol>";

    var body = "";
    if (s.step === 1) {
      body += '<span class="eyebrow">Начнём с ситуации</span><h3>Какая помощь нужна сейчас?</h3><p class="calc__hint">Это предварительный подбор услуг, а не медицинское решение.</p>';
      body += '<div class="options" role="radiogroup" aria-label="Ситуация">' +
        this.option("radio", "situation", "vet", s.situation === "vet", "steth", "Нужен ветеринар на дом", "Осмотр, разговор и процедура, если вы примете такое решение") +
        this.option("radio", "situation", "died", s.situation === "died", "heart", "Питомец уже умер", "Вывоз тела и кремация") + "</div>";
      body += '<p class="calc__hint">' + icon("chat") + ' Ещё не решили? <button type="button" class="calc-inline-link" data-open="callback" data-topic="Консультация">Задайте вопрос</button> — расскажем, какие есть варианты.</p>';
    }
    if (s.step === 2) {
      body += '<span class="eyebrow">О питомце</span><h3>Кто ваш питомец?</h3>';
      body += '<div class="options options--sm" role="radiogroup" aria-label="Вид питомца">' + Object.keys(C.species).map(function (k) {
        var sp = C.species[k];
        return self.option("radio", "species", k, s.species === k, sp.icon, sp.short, "", true);
      }).join("") + "</div>";
      var allowed = C.species[s.species].weights;
      if (allowed.length > 1) {
        body += '<div class="calc__group"><span class="calc__group-title">Примерный вес</span><div class="options options--xs" role="radiogroup" aria-label="Вес">' + allowed.map(function (wid) {
          var w = C.weights.filter(function (x) { return x.id === wid; })[0];
          return self.option("radio", "weight", wid, s.weight === wid, "", w.label, "", true);
        }).join("") + "</div></div>";
      } else {
        body += '<p class="calc__hint">Для этого вида питомцев действует одна цена, вес указывать не нужно.</p>';
      }
    }
    if (s.step === 3) {
      body += '<span class="eyebrow">Состав услуг</span><h3>Что нужно организовать?</h3>';
      if (s.situation === "vet") {
        body += '<div class="calc__group"><span class="calc__group-title">Визит врача</span><div class="options">' +
          '<div class="option option--compact"><span class="option__ico">' + icon("steth") + '</span><span class="option__text"><strong>' + esc(C.services.euth.label) + '</strong><small>Входит в расчёт</small></span><span class="option__price">' + priceHtml(C.services.euth.prices[s.weight]) + "</span></div></div></div>";
      }
      var crem = [["individual", C.services.individual], ["common", C.services.common]];
      if (s.situation === "vet") crem.push(["none", { label: "Без кремации", note: "Решу позже или организую сам(а)", prices: null }]);
      body += '<div class="calc__group"><span class="calc__group-title">Кремация</span><div class="options" role="radiogroup" aria-label="Кремация">' + crem.map(function (c) {
        var price = c[1].prices ? priceHtml(c[1].prices[s.weight]) : "";
        return self.option("radio", "cremation", c[0], s.cremation === c[0], c[0] === "none" ? "close" : "flame", c[1].label, c[1].note, false, price);
      }).join("") + "</div></div>";
      if (s.cremation !== "none") {
        var ex = ["pickup"];
        if (s.cremation === "individual") ex = ex.concat(["urn", "delivery", "report"]);
        body += '<div class="calc__group"><span class="calc__group-title">Дополнительно</span><div class="options">' + ex.map(function (k) {
          var e = C.extras[k];
          return self.option("checkbox", k, "1", !!s[k], "", e.label, e.note, false, priceHtml(e.price), true);
        }).join("") + "</div></div>";
      }
      if (C.zones && C.zones.length) {
        body += '<div class="calc__group"><span class="calc__group-title">Где находится питомец</span><div class="options options--sm" role="radiogroup" aria-label="Зона выезда">' + C.zones.map(function (z) {
          var p = isNum(z.price) ? (z.price === 0 ? "без доплаты" : "+" + rub(z.price)) : "доплата уточняется";
          return self.option("radio", "zone", z.id, s.zone === z.id, "", z.label, p, true);
        }).join("") + "</div></div>";
      }
    }
    if (s.step === 4) {
      var r = this.calcTotal();
      body += '<span class="eyebrow">Предварительный расчёт</span><h3>' + (r.unknown ? "Ваш запрос стоимости" : "Ориентировочная стоимость") + "</h3>";
      body += '<div class="calc-summary">' + r.rows.map(function (row) {
        return '<div class="calc-summary__row' + (row.muted ? " calc-summary__row--muted" : "") + '"><span>' + esc(row.label) + "</span><span>" + row.value + "</span></div>";
      }).join("") + '<div class="calc-summary__total"><span>Итого</span><strong>' + (r.unknown ? "назовём по телефону" : (r.approx ? "от " : "") + rub(r.total)) + "</strong></div></div>";
      body += '<p class="calc__hint">Окончательную стоимость подтвердим до начала работы. Расчёт не является публичной офертой.</p>';
      body += '<div class="btn-row"><button type="button" class="btn btn--primary" data-open="callback" data-topic="Узнать цену" data-details="' + esc(r.summary) + '" data-booking="1">' + icon("send") + 'Отправить запрос</button><button type="button" class="btn" data-calc-restart>' + icon("arrow-left") + "Пересчитать</button></div>";
    }

    var foot = '<div class="calc__foot"><button type="button" class="btn btn--sm" data-calc-back' + (s.step === 1 ? " disabled" : "") + ">" + icon("arrow-left") + 'Назад</button><span class="calc__counter">Шаг ' + s.step + " из 4</span>" +
      (s.step < 4 ? '<button type="button" class="btn btn--primary btn--sm" data-calc-next>' + (s.step === 3 ? "Показать расчёт" : "Продолжить") + icon("arrow-right") + "</button>" : '<span class="calc__foot-spacer"></span>') + "</div>";

    this.root.innerHTML = '<div class="calc">' + steps + '<div class="calc__body" aria-live="polite">' + body + "</div>" + foot + "</div>" +
      '<p class="calc__privacy">' + icon("lock") + "Расчёт выполняется в браузере. Чтобы увидеть его, контакты оставлять не нужно.</p>";
    this.bind();
  };
  Calc.prototype.option = function (type, name, value, checked, ico, title, sub, compact, price, row) {
    var id = this.uid + "-" + name + "-" + value;
    return '<label class="option' + (compact ? " option--compact" : "") + (row ? " option--row" : "") + '" for="' + id + '">' +
      '<input type="' + type + '" id="' + id + '" name="' + this.uid + "-" + name + '" value="' + value + '"' + (checked ? " checked" : "") + ' data-key="' + name + '">' +
      (ico ? '<span class="option__ico">' + icon(ico) + "</span>" : "") +
      '<span class="option__text"><strong>' + esc(title) + "</strong>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span>" +
      (price ? '<span class="option__price">' + price + "</span>" : "") +
      '<span class="option__check">' + icon("check") + "</span></label>";
  };
  Calc.prototype.bind = function () {
    var self = this, s = this.state;
    $$("input[data-key]", this.root).forEach(function (inp) {
      inp.addEventListener("change", function () {
        var k = inp.getAttribute("data-key");
        if (inp.type === "checkbox") s[k] = inp.checked; else s[k] = inp.value;
        if (k === "species") {
          var allowed = C.species[s.species].weights;
          if (allowed.indexOf(s.weight) === -1) s.weight = allowed[0];
          self.render(); self.focusFirst();
        }
        if (k === "situation") { if (s.situation === "died" && s.cremation === "none") s.cremation = "individual"; s.pickup = true; }
        if (k === "cremation") { if (s.cremation === "individual") s.urn = true; self.render(); self.focusFirst(); }
      });
    });
    var next = $("[data-calc-next]", this.root), back = $("[data-calc-back]", this.root), restart = $("[data-calc-restart]", this.root);
    if (next) next.addEventListener("click", function () { s.step = Math.min(4, s.step + 1); self.render(); self.focusFirst(); if (s.step === 4) track("calculator_complete", { situation: s.situation, species: s.species }); });
    if (back) back.addEventListener("click", function () { s.step = Math.max(1, s.step - 1); self.render(); self.focusFirst(); });
    if (restart) restart.addEventListener("click", function () { s.step = 1; self.render(); self.focusFirst(); });
  };
  Calc.prototype.focusFirst = function () {
    var h = $(".calc__body h3", this.root);
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  };
  Calc.prototype.calcTotal = function () {
    var s = this.state, rows = [], total = 0, approx = false, unknown = false, parts = [];
    var sp = C.species[s.species];
    var w = C.weights.filter(function (x) { return x.id === s.weight; })[0];
    var petLabel = sp.short + (sp.weights.length > 1 ? ", " + w.label : "");
    rows.push({ label: "Питомец", value: esc(petLabel), muted: true });
    parts.push("Питомец: " + petLabel);
    var add = function (label, price) {
      if (isNum(price)) { var v = price === 0 ? "бесплатно" : rub(price); rows.push({ label: label, value: v }); total += price; parts.push(label + " — " + v); }
      else { rows.push({ label: label, value: PH_PRICE }); unknown = true; parts.push(label); }
    };
    if (s.situation === "vet") add(C.services.euth.label, C.services.euth.prices[s.weight]);
    if (s.cremation !== "none") {
      add(C.services[s.cremation].label, C.services[s.cremation].prices[s.weight]);
      ["pickup", "urn", "delivery", "report"].forEach(function (k) {
        if (!s[k]) return;
        if (k !== "pickup" && s.cremation !== "individual") return;
        add(C.extras[k].label, C.extras[k].price);
      });
    }
    var z = (C.zones || []).filter(function (x) { return x.id === s.zone; })[0];
    if (z) {
      if (!isNum(z.price)) { rows.push({ label: "Выезд: " + z.label, value: "доплата уточняется", muted: true }); approx = true; parts.push("Выезд: " + z.label); }
      else if (z.price === 0) { rows.push({ label: "Выезд: " + z.label, value: "без доплаты", muted: true }); parts.push("Выезд: " + z.label); }
      else add("Выезд: " + z.label, z.price);
    }
    if (!unknown) parts.push("Итого: " + (approx ? "от " : "") + rub(total));
    return { rows: rows, total: total, approx: approx, unknown: unknown, summary: parts.join("; ") };
  };
  function initCalcs() { $$("[data-calc]").forEach(function (root, idx) { new Calc(root, idx); }); }

  /* ---------- 5. Слайдер ---------- */
  function initSliders() {
    $$("[data-slider]").forEach(function (box) {
      var track = $(".slider__track", box);
      var scope = box.parentNode;
      var prev = $("[data-slider-prev]", scope), next = $("[data-slider-next]", scope);
      if (!track) return;
      var step = function () { var c = track.children[0]; return c ? c.getBoundingClientRect().width + 20 : 300; };
      var update = function () {
        if (prev) prev.disabled = track.scrollLeft <= 4;
        if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      };
      if (prev) prev.addEventListener("click", function () { track.scrollBy({ left: -step(), behavior: "smooth" }); });
      if (next) next.addEventListener("click", function () { track.scrollBy({ left: step(), behavior: "smooth" }); });
      track.addEventListener("scroll", function () { window.requestAnimationFrame(update); }, { passive: true });
      window.addEventListener("resize", update);
      update();
    });
  }

  /* ---------- 6. Формы ---------- */
  var BOOKING_TOPICS = ["Усыпление на дому", "Вывоз тела", "Индивидуальная кремация", "Общая кремация", "Узнать цену"];
  function formatPhone(v) {
    var d = v.replace(/\D/g, "");
    if (!d) return "";
    if (d[0] === "8") d = "7" + d.slice(1);
    if (d[0] !== "7") d = "7" + d;
    d = d.slice(0, 11);
    var out = "+7";
    if (d.length > 1) out += " (" + d.slice(1, 4);
    if (d.length >= 4) out += ")";
    if (d.length > 4) out += " " + d.slice(4, 7);
    if (d.length > 7) out += "-" + d.slice(7, 9);
    if (d.length > 9) out += "-" + d.slice(9, 11);
    return out;
  }
  function initForms() {
    $$("input[type=tel]").forEach(function (inp) {
      inp.addEventListener("input", function () { inp.value = formatPhone(inp.value); });
      inp.addEventListener("focus", function () { if (!inp.value) inp.value = "+7 ("; });
      inp.addEventListener("blur", function () { if (inp.value.replace(/\D/g, "").length <= 1) inp.value = ""; });
    });
    var messengerMode = !C.formEndpoint && !!(C.whatsappUrl || C.telegramUrl);
    if (!C.formEndpoint && !messengerMode) {
      // Приём заявок не подключён: не даём вводить данные, которые никуда не уйдут
      $$("form[data-form]").forEach(function (form) {
        $$("input, select, textarea, button[type=submit]", form).forEach(function (el) { el.disabled = true; });
        var note = document.createElement("p");
        note.className = "form-off";
        note.textContent = "Приём заявок через сайт скоро заработает. Сейчас форма отключена, данные не собираются.";
        var title = $(".form-card__title", form);
        if (title && title.nextElementSibling) title.parentNode.insertBefore(note, title.nextElementSibling.nextSibling);
        else form.insertBefore(note, form.firstChild);
      });
      return;
    }
    $$("form[data-form]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var ok = true;
        $$(".field", form).forEach(function (f) { f.classList.remove("is-invalid"); var er = $(".field__error", f); if (er) er.textContent = ""; });
        var tel = $("input[type=tel]", form);
        var telLen = tel ? tel.value.replace(/\D/g, "").length : 0;
        if (tel && ((tel.required && telLen !== 11) || (!tel.required && telLen > 1 && telLen !== 11))) {
          ok = false; var f = tel.closest(".field"); f.classList.add("is-invalid"); $(".field__error", f).textContent = "Введите номер полностью: +7 и ещё 10 цифр.";
        }
        var consent = $("input[name=consent]", form);
        var cl = consent && consent.closest(".consent");
        if (cl) cl.classList.remove("is-invalid");
        if (consent && !consent.checked) { ok = false; cl.classList.add("is-invalid"); }
        if (!ok) { var first = $(".is-invalid input, .consent.is-invalid input", form); if (first) first.focus(); return; }

        var data = {};
        new FormData(form).forEach(function (v, k) { data[k] = v; });
        data.form = form.getAttribute("data-form");
        data.page = location.pathname;
        var isBooking = BOOKING_TOPICS.indexOf(data.topic) !== -1 || !!data.details;
        var status = $(".form-status", form);
        var btn = $("button[type=submit]", form);
        var done = function (title, text, good) {
          status.hidden = false;
          status.innerHTML = icon(good ? "check" : "info") + "<div><strong>" + esc(title) + "</strong>" + esc(text) + "</div>";
        };
        var success = function () {
          track("form_submit", { form: data.form, topic: data.topic });
          if (isBooking) track("booking_request", { topic: data.topic, has_calc: !!data.details });
        };
        if (messengerMode) {
          var via = (e.submitter && e.submitter.getAttribute("data-send")) || (C.whatsappUrl ? "wa" : "tg");
          var lines = ["Здравствуйте! Заявка с сайта " + C.brand + "."];
          if (data.topic) lines.push("Услуга: " + data.topic);
          if (data.name) lines.push("Имя: " + data.name);
          if (data.phone && data.phone.replace(/\D/g, "").length === 11) lines.push("Телефон: " + data.phone);
          if (data.time) lines.push("Удобное время: " + data.time);
          if (data.location) lines.push("Район или адрес: " + data.location);
          if (data.details) lines.push("Расчёт: " + data.details);
          var text = lines.join("\n");
          success();
          if (via === "wa") {
            track("whatsapp_click", { link_url: C.whatsappUrl, from: "form" });
            window.open(C.whatsappUrl + "?text=" + encodeURIComponent(text), "_blank", "noopener");
            done("Откроется WhatsApp", " Проверьте текст заявки и нажмите «Отправить» в чате.", true);
          } else {
            track("telegram_click", { link_url: C.telegramUrl, from: "form" });
            var copied = false;
            try { if (navigator.clipboard) { navigator.clipboard.writeText(text); copied = true; } } catch (err) {}
            window.open(C.telegramUrl, "_blank", "noopener");
            done("Откроется Telegram", copied ? " Текст заявки скопирован — вставьте его в чат и отправьте." : " Напишите в чат, что вам нужно, — ответим.", true);
          }
          return;
        }
        if (C.formEndpoint) {
          btn.disabled = true;
          fetch(C.formEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
            .then(function (r) { if (!r.ok) throw new Error(r.status); form.reset(); success(); done("Заявка отправлена", " Мы свяжемся с вами в ближайшее время.", true); })
            .catch(function () { done("Не получилось отправить заявку", " Пожалуйста, позвоните нам" + (C.phone ? ": " + C.phone : "") + ".", false); })
            .then(function () { btn.disabled = false; });
        } else {
          form.reset();
          success();
          done("Демо-режим: заявка не отправлена", " Форма работает, но обработчик ещё не подключён (formEndpoint в _src/site.json).", true);
        }
      });
    });
  }

  /* ---------- 7. Модальные окна ---------- */
  function initModals() {
    document.addEventListener("click", function (e) {
      var opener = e.target.closest("[data-open]");
      if (!opener) return;
      var id = opener.getAttribute("data-open");
      var dlg = document.getElementById(id + "-modal");
      if (!dlg || typeof dlg.showModal !== "function") return;
      e.preventDefault();
      if (window.__closeMobileMenu) window.__closeMobileMenu();
      var topic = opener.getAttribute("data-topic");
      var details = opener.getAttribute("data-details") || "";
      var sel = $("select[name=topic]", dlg);
      if (sel && topic) { var has = $$("option", sel).some(function (o) { return o.value === topic; }); if (has) sel.value = topic; }
      var hid = $("input[name=details]", dlg), note = $(".form-details", dlg);
      if (hid) hid.value = details;
      if (note) { note.hidden = !details; note.textContent = details ? "К заявке приложен расчёт: " + details : ""; }
      var st = $(".form-status", dlg); if (st) st.hidden = true;
      dlg.showModal();
      var focusEl = $("input:not([type=hidden])", dlg); if (focusEl) setTimeout(function () { focusEl.focus(); }, 30);
      if (id === "search") runSearch("");
    });
    $$("dialog").forEach(function (dlg) {
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
      $$("[data-close]", dlg).forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
    });
  }

  /* ---------- 8. Поиск по сайту ---------- */
  var INDEX = [
    { t: "Главная", u: "index.html", d: "Усыпление на дому и кремация животных", k: "главная служба" },
    { t: "Усыпление на дому", u: "usyplenie.html", d: "Показания, визит врача, подготовка, цены", k: "эвтаназия усыпить усыпление врач на дом" },
    { t: "Усыпление кошки на дому", u: "usyplenie-koshek.html", d: "Особенности визита для кошек", k: "кошка кот усыпить кошку" },
    { t: "Усыпление собаки на дому", u: "usyplenie-sobak.html", d: "Крупные и пожилые собаки, цены по весу", k: "собака пёс пес усыпить собаку" },
    { t: "Грызуны, кролики, хорьки", u: "usyplenie.html#gryzuny", d: "Хомяки, крысы, морские свинки, кролики", k: "хомяк крыса свинка кролик хорёк хорек грызун" },
    { t: "Птицы и экзотические животные", u: "usyplenie.html#pticy", d: "Попугаи, рептилии, черепахи", k: "птица попугай рептилия черепаха экзотика ящерица змея" },
    { t: "Как подготовиться к визиту", u: "usyplenie.html#podgotovka", d: "Что сделать до приезда врача", k: "подготовка подготовиться приезд" },
    { t: "Кремация животных", u: "kremaciya.html", d: "Общая и индивидуальная кремация", k: "кремация кремировать прах крематорий" },
    { t: "Индивидуальная кремация", u: "kremaciya.html#individualnaya", d: "Прах возвращается в урне", k: "индивидуальная прах урна" },
    { t: "Общая кремация", u: "kremaciya.html#obshchaya", d: "Без возврата праха", k: "общая групповая" },
    { t: "Вывоз тела животного", u: "vyvoz.html", d: "Заберём питомца из дома или клиники", k: "вывоз забрать тело умер умерла" },
    { t: "Кремация кошки", u: "kremaciya-koshek.html", d: "Индивидуальная и общая, цены по весу", k: "кремация кошка кот кошки прах урна" },
    { t: "Кремация собаки", u: "kremaciya-sobak.html", d: "Индивидуальная и общая, цены по весу", k: "кремация собака пёс собаки крупная прах урна" },
    { t: "Урны для праха", u: "kremaciya.html#urny", d: "Выбор урны и доставка", k: "урна доставка праха" },
    { t: "Фото- и видеоотчёт", u: "kremaciya.html#otchet", d: "Подтверждение индивидуальной кремации", k: "фото видео отчёт отчет подтверждение" },
    { t: "Цены", u: "ceny.html", d: "Прайс по видам питомцев и весу", k: "цена стоимость прайс сколько стоит" },
    { t: "Калькулятор и запрос цены", u: "ceny.html#kalkulyator", d: "Расчёт за 4 шага", k: "калькулятор расчёт рассчитать" },
    { t: "О службе", u: "o-nas.html", d: "Кто мы, врачи, опыт", k: "о нас служба врачи команда опыт" },
    { t: "Зона выезда", u: "zona.html", d: "Районы и пригороды, доплаты за выезд", k: "зона выезд география район пригород" },
    { t: "Полезная информация", u: "stati.html", d: "Памятки для владельцев", k: "статьи памятки советы" },
    { t: "Как подготовиться к визиту ветеринара", u: "stati-podgotovka.html", d: "Памятка владельцу", k: "подготовка визит место прощание" },
    { t: "Общая или индивидуальная кремация", u: "stati-kremaciya.html", d: "Как выбрать формат", k: "выбрать кремацию разница" },
    { t: "Питомец умер дома: что делать", u: "stati-pitomec-umer.html", d: "Первые часы: пошагово", k: "умер умерла дома ночью что делать" },
    { t: "Как пережить уход питомца", u: "stati-poterya.html", d: "Горе, чувство вины, разговор с детьми", k: "горе утрата дети вина поддержка" },
    { t: "Вопросы и ответы", u: "faq.html", d: "Ответы на частые вопросы", k: "вопрос ответ faq больно сколько длится" },
    { t: "Отзывы", u: "otzyvy.html", d: "Обратная связь владельцев", k: "отзыв отзывы обратная связь" },
    { t: "Контакты", u: "kontakty.html", d: "Телефон, мессенджеры, часы работы", k: "контакты телефон почта whatsapp telegram связаться" },
    { t: "Обработка персональных данных", u: "privacy.html", d: "Политика конфиденциальности", k: "политика персональные данные конфиденциальность" },
    { t: "Согласие на обработку персональных данных", u: "soglasie.html", d: "Текст согласия", k: "согласие персональные данные 152-фз" }
  ];
  function runSearch(q) {
    var list = $("#search-results");
    if (!list) return;
    q = q.trim().toLowerCase();
    var res = !q ? INDEX.slice(0, 8) : INDEX.filter(function (i) { return (i.t + " " + i.d + " " + i.k).toLowerCase().indexOf(q) !== -1; });
    list.innerHTML = res.length ? res.map(function (i) { return '<li><a href="' + i.u + '"><strong>' + esc(i.t) + "</strong><small>" + esc(i.d) + "</small></a></li>"; }).join("") : '<li class="search-empty">Ничего не нашли. Попробуйте другое слово или позвоните нам — подскажем.</li>';
  }
  function initSearch() {
    var inp = $("#search-input");
    if (!inp) return;
    inp.addEventListener("input", function () { runSearch(inp.value); });
    var list = $("#search-results");
    if (list) list.addEventListener("click", function (e) { if (e.target.closest("a")) { var d = $("#search-modal"); if (d) d.close(); } });
  }

  /* ---------- 9. Прочее ---------- */
  function initToTop() {
    var b = $(".to-top");
    if (!b) return;
    window.addEventListener("scroll", function () { b.classList.toggle("is-visible", window.scrollY > 700); }, { passive: true });
    b.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  }
  function initSubnav() {
    var links = $$(".subnav a[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (a) { var t = document.getElementById(a.getAttribute("href").slice(1)); if (t) map[t.id] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { links.forEach(function (l) { l.classList.remove("is-active"); }); var a = map[en.target.id]; if (a) a.classList.add("is-active"); }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
  }
  function initFilters() {
    var btns = $$("[data-filter]");
    if (!btns.length) return;
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.getAttribute("data-filter");
        btns.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        $$("[data-cat]").forEach(function (card) { card.hidden = f !== "all" && card.getAttribute("data-cat") !== f; });
      });
    });
  }
  function initHash() {
    if (!location.hash) return;
    var el = document.getElementById(location.hash.slice(1));
    if (!el) return;
    if (el.tagName === "DETAILS") el.open = true;
    // Калькулятор дорисовывается скриптом — после этого возвращаемся к якорю
    window.addEventListener("load", function () { el.scrollIntoView({ block: "start" }); });
  }

  function start() {
    initAnalytics();
    initHeader();
    initTabs();
    initCalcs();
    initSliders();
    initForms();
    initModals();
    initSearch();
    initToTop();
    initSubnav();
    initFilters();
    initHash();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
