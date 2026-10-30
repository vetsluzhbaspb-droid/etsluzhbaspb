"""Иконки и эмблема сайта «Ветслужба СПб»."""


def icon(name, cls="icon"):
    return f'<svg class="{cls}" aria-hidden="true"><use href="#i-{name}"/></svg>'


ICONS = {
    "phone": '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    "chat": '<path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L4 20.5l1.1-4.4A8.5 8.5 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
    "calc": '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "steth": '<path d="M6 3H5v5a4.5 4.5 0 0 0 9 0V3h-1"/><path d="M9.5 12.5V15a5 5 0 0 0 10 0v-2"/><circle cx="19.5" cy="11" r="2"/>',
    "doc": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    "heart": '<path d="M12 20s-7.5-4.6-9.2-9.4A4.9 4.9 0 0 1 12 7a4.9 4.9 0 0 1 9.2 3.6C19.5 15.4 12 20 12 20z"/>',
    "home": '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    "truck": '<path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
    "urn": '<path d="M8 3.5h8M9.5 3.5V6A4.5 4.5 0 0 0 6 10.5c0 4 2 7 3 9h6c1-2 3-5 3-9A4.5 4.5 0 0 0 14.5 6V3.5"/><path d="M7 20.5h10M8 11h8"/>',
    "flame": '<path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4.3-3.3-6.3-4.5-10.5-2 2-3 4-3 6.2-1-1-1.8-2.1-2-3.7C7 8.6 5.5 11.4 5.5 14.5A6.5 6.5 0 0 0 12 21z"/>',
    "camera": '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    "pin": '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    "check": '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    "arrow-up": '<path d="M12 19V5M6 11l6-6 6 6"/>',
    "chev": '<path d="M6 9l6 6 6-6"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    "menu": '<path d="M4 7h16M4 12h16M4 17h16"/>',
    "close": '<path d="M6 6l12 12M18 6L6 18"/>',
    "paw": '<circle cx="6.5" cy="10" r="1.9"/><circle cx="10" cy="6" r="1.9"/><circle cx="14" cy="6" r="1.9"/><circle cx="17.5" cy="10" r="1.9"/><path d="M12 11.5c-2.8 0-5.6 3.6-5.6 5.9 0 1.5 1.2 2.4 2.8 2.4 1.2 0 1.8-.6 2.8-.6s1.6.6 2.8.6c1.6 0 2.8-.9 2.8-2.4 0-2.3-2.8-5.9-5.6-5.9z"/>',
    "cat": '<path d="M4.5 4l3.8 3.3h7.4L19.5 4v8a7.5 7.5 0 0 1-15 0z"/><path d="M9.3 12h.01M14.7 12h.01M11 15.2l1 .9 1-.9"/>',
    "dog": '<path d="M7.5 5.5h9L20 7l-.8 5.2-2-.6V14a5.2 5.2 0 0 1-10.4 0v-2.4l-2 .6L4 7z"/><path d="M9.6 11.3h.01M14.4 11.3h.01M11 15h2l-1 1.2z"/>',
    "rodent": '<path d="M3.5 17.5c0-4.4 3.7-7.5 8-7.5 2.7 0 4.6 1.2 5.7 2.8l2.8 1-.7 3.2-1.6.5z"/><circle cx="11.5" cy="8.3" r="2.2"/><path d="M15.6 14.3h.01M3.5 17.5c-1 .8-1 2.6.6 2.8"/>',
    "bird": '<path d="M4 14.5c3 0 5-2.2 6-5.3a4 4 0 0 1 7.8-.7L21 10l-3 1v1c0 4.3-3.2 7.5-8 7.5H6l2-2.2c-2 0-3.2-1-4-2.8z"/><path d="M14.6 8.4h.01"/>',
    "turtle": '<path d="M4.5 15a7.5 6.5 0 0 1 15 0z"/><path d="M3 15h18M19.5 13H21a1.6 1.6 0 0 1 0 3.2h-1.2M7 15v3M17 15v3M9 10.5l3 2 3-2"/>',
    "shield": '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    "mail": '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    "calendar": '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    "book": '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
    "leaf": '<path d="M5 19c0-8.5 5.5-14 15-14 0 9.5-5.5 15-14 15"/><path d="M5 19l7.5-7.5"/>',
    "hand": '<path d="M7.5 11.5V6a1.5 1.5 0 0 1 3 0v4.5M10.5 10.5V4.5a1.5 1.5 0 0 1 3 0v6M13.5 10.5V5.5a1.5 1.5 0 0 1 3 0V11M16.5 11V8.5a1.5 1.5 0 0 1 3 0v5.5a7 7 0 0 1-7 7h-.8a6 6 0 0 1-5-2.7l-3-4.6a1.6 1.6 0 0 1 2.6-1.9l1.2 1.4"/>',
    "lock": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    "map": '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    "photo": '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5-8.5 8"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    "moon": '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    "star": '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
    "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    "route": '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
}

# Мессенджеры (упрощённые контурные значки)
ICONS["whatsapp"] = '<path d="M4 20l1.2-3.9A8.5 8.5 0 1 1 8 18.9z"/><path d="M9 8.6c.2-.5.6-.6 1-.6h.4l1 2.2-.7.9a6 6 0 0 0 2.6 2.5l.9-.7 2.2 1v.4c0 .5-.3 1-.7 1.1-.6.2-1.6.2-3.1-.7a10 10 0 0 1-3.3-3.4C8.6 10.2 8.7 9.2 9 8.6z"/>'
ICONS["telegram"] = '<path d="M21 4.5L3.5 11.3l5.6 2 2 5.9 3-3.6 4.6 3.4z"/><path d="M9.1 13.3l8.3-6"/>'
ICONS["send"] = '<path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13l5-5"/>'


SPRITE = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' + "".join(
    f'<symbol id="i-{k}" viewBox="0 0 24 24">{v}</symbol>' for k, v in ICONS.items()
) + "</svg>"


def emblem(uid, size=46, cls="brand__mark"):
    """Эмблема: арка окна, лапа и тёплый огонёк."""
    return f'''<svg class="{cls}" width="{size}" height="{size}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="g-{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d9ad0"/><stop offset="1" stop-color="#22598c"/></linearGradient></defs><path d="M8 30a24 24 0 0 1 48 0v24a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z" fill="url(#g-{uid})"/><circle cx="32" cy="17.5" r="8.5" fill="#f2b56b" opacity=".25"/><circle cx="32" cy="17.5" r="4.6" fill="#f2b56b"/><g fill="#fff"><ellipse cx="21.6" cy="34.4" rx="3.3" ry="4.1" transform="rotate(-24 21.6 34.4)"/><ellipse cx="27.6" cy="29" rx="3.4" ry="4.4" transform="rotate(-8 27.6 29)"/><ellipse cx="36.4" cy="29" rx="3.4" ry="4.4" transform="rotate(8 36.4 29)"/><ellipse cx="42.4" cy="34.4" rx="3.3" ry="4.1" transform="rotate(24 42.4 34.4)"/><path d="M32 37c-4.6 0-9.5 5.6-9.5 9.6 0 2.6 2 4 4.6 4 2 0 3.2-1 4.9-1s2.9 1 4.9 1c2.6 0 4.6-1.4 4.6-4 0-4-4.9-9.6-9.5-9.6z"/></g></svg>'''


