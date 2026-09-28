/* =====================================================================
   GY WALLPAPER: PHOTO ARC CAROUSEL
   All 6 photos sit on ONE shared track. A single scroll value moves the
   whole track right -> left, and every photo's x / y / tilt is calculated
   from the same arc equation. Nothing is positioned by hand.
   All numbers below are in 1920x1080 "design pixels" and are scaled
   automatically to the real screen size.
   ===================================================================== */

const CONFIG = {
    designW: 1920,
    designH: 1080,

    /* ARC = the glowing rim of the LOWER planet in your background.
       Measured from the image (1920x1080 space): a circle whose top is at
       x = 960, y = 451 with radius 2276 (fit error about 1px). */
    rimTop: 451,
    rimRadius: 2276,

    /* How the photos sit on the rim:
       rideLift 1   = photos stand ON the glow (bottom edge touches it)
       rideLift 0   = photos are centred ON the glow like beads on a wire
       rideOffset   = extra px pushed away from the planet */
    rideLift: 1,
    rideOffset: 10,

    /* HOW MUCH OF THE ARC THE PHOTOS TRAVEL ALONG
       travel = total length of the loop in 1920-wide px.
         1300 = compact bunch in the middle
         1800 = photos sweep the whole rim, edge to edge   <- current
         2300 = photos fully leave the screen before re-entering
       The six photos are spread evenly over this length. */
    travel: 1800,
    gap: 56,                /* smallest allowed gap between neighbouring photos */
    fade: 170,              /* photos fade out/in over this distance at the two ends of the loop */

    /* CARD SIZE: every photo keeps its own aspect ratio.
       All photos get a similar area, so portrait and landscape look balanced. */
    cardArea: 30000,
    maxCardHeight: 230,

    /* MOTION */
    speed: 60,              /* px per second, right -> left */
    hoverScale: 1.10,
    focusScale: 1.40,
    focusLift: 60           /* px a clicked photo rises off the rim */
};

const stage  = document.querySelector(".photo-stage");
const photos = Array.from(document.querySelectorAll(".photo"));

const state = {
    scroll: 0,              /* how far the track has travelled */
    speedFactor: 1,         /* eased 0..1 so pausing/resuming is smooth */
    hovered: -1,
    focused: -1,
    dragging: false
};

let items = [];             /* per-photo data: base size, slot position, eased scale */
let loopLength = 0;
/* The background is stretched to fill the window (100% 100%), so the arc is
   stretched too. kx / ky follow that stretch; ks (the smaller of the two) is
   used for photo sizes so photos never get squashed. */
let kx = 1, ky = 1, ks = 1;


/* =========================
   SIZES + TRACK LAYOUT
========================= */

function measurePhotos() {
    items = photos.map((el) => {
        const ratio = (el.naturalWidth && el.naturalHeight)
            ? el.naturalWidth / el.naturalHeight
            : 3 / 4;

        let h = Math.sqrt(CONFIG.cardArea / ratio);
        h = Math.min(h, CONFIG.maxCardHeight);
        const w = h * ratio;

        return { el, w, h, slot: 0, scale: 1 };
    });

    layoutTrack();
}

/* Spread the photos evenly over the travel length: same gap between every
   neighbour, whatever their widths. Re-run on resize so the photos always
   sweep the same share of the screen width. */
function layoutTrack() {
    const travel = CONFIG.travel * kx / ks;      /* in photo-size units */
    const totalWidth = items.reduce((sum, it) => sum + it.w, 0);
    const gap = Math.max(CONFIG.gap, (travel - totalWidth) / items.length);

    let cursor = 0;
    items.forEach((it) => {
        it.slot = cursor + it.w / 2;
        cursor += it.w + gap;
    });
    loopLength = cursor;
}

function applySizes() {
    kx = window.innerWidth  / CONFIG.designW;
    ky = window.innerHeight / CONFIG.designH;
    ks = Math.min(kx, ky);
    layoutTrack();
    items.forEach((it) => {
        it.el.style.width  = (it.w * ks) + "px";
        it.el.style.height = (it.h * ks) + "px";
    });
}


/* =========================
   THE ARC
   Same equation for every photo.
========================= */

function arcPoint(dx) {
    const R = CONFIG.rimRadius;
    const s = Math.sqrt(R * R - dx * dx);
    return {
        y:    CONFIG.rimTop + (R - s),      /* rim height at this x */
        tilt: Math.atan2(dx, s)             /* tangent angle of the rim */
    };
}

const wrap = (v, len) => ((v % len) + len) % len;
const clamp01 = (v) => Math.max(0, Math.min(1, v));


/* =========================
   FRAME
========================= */

let last = performance.now();

function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    /* pause while hovering a photo, dragging, or when one is focused */
    const wantsPause = state.hovered >= 0 || state.focused >= 0 || state.dragging;
    const target = wantsPause ? 0 : 1;
    state.speedFactor += (target - state.speedFactor) * Math.min(1, dt * 6);

    state.scroll += CONFIG.speed * state.speedFactor * dt;

    const screenCx = window.innerWidth / 2;
    const half = loopLength / 2;

    items.forEach((it, i) => {
        /* position along the loop, centred on 0 so the wrap-around happens at the ends */
        const dx = wrap(it.slot - state.scroll + half, loopLength) - half;

        /* dx is a distance along the track in photo-size units (x ks on screen).
           Convert it to the background's own coordinates to read the rim there. */
        const dxd = dx * ks / kx;
        const arc = arcPoint(dxd);
        /* rim tilt as it appears on screen after the background's stretch */
        const tilt = Math.atan2(ky * Math.sin(arc.tilt), kx * Math.cos(arc.tilt));

        /* fade + shrink at both ends, so a photo leaving the left is
           invisible when it re-enters on the right (seamless loop) */
        const edge    = clamp01((half - Math.abs(dx)) / CONFIG.fade);
        const opacity = edge;
        const edgeScale = 0.85 + 0.15 * edge;

        /* eased hover / focus scale */
        let targetScale = 1;
        if (i === state.focused) targetScale = CONFIG.focusScale;
        else if (i === state.hovered) targetScale = CONFIG.hoverScale;
        it.scale += (targetScale - it.scale) * Math.min(1, dt * 10);

        /* rim point for this photo, then push the photo out along the rim's normal
           so it rides ON the glow, tilted with it */
        const focused = (i === state.focused);
        const out = ((it.h * edgeScale / 2) * CONFIG.rideLift + CONFIG.rideOffset
                  + (focused ? CONFIG.focusLift : 0)) * ks;
        const px = screenCx + dx * ks + Math.sin(tilt) * out;
        const py = arc.y * ky - Math.cos(tilt) * out;

        const x = px - (it.w * ks) / 2;
        const y = py - (it.h * ks) / 2;
        const rot = focused ? 0 : tilt * 180 / Math.PI;

        it.el.style.transform =
            `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
            `rotate(${rot.toFixed(2)}deg) scale(${(it.scale * edgeScale).toFixed(3)})`;
        it.el.style.opacity = opacity.toFixed(3);
        it.el.style.zIndex  = (i === state.focused) ? 5000 : Math.round(1000 - Math.abs(dx));
    });

    requestAnimationFrame(frame);
}


/* =========================
   INTERACTION
========================= */

photos.forEach((el, i) => {
    el.addEventListener("pointerenter", () => { state.hovered = i; });
    el.addEventListener("pointerleave", () => { if (state.hovered === i) state.hovered = -1; });
    el.draggable = false;
});

/* Drag anywhere to scrub the carousel */
let dragStartX = 0;
let dragMoved = 0;

window.addEventListener("pointerdown", (e) => {
    state.dragging = true;
    dragStartX = e.clientX;
    dragMoved = 0;
});

window.addEventListener("pointermove", (e) => {
    if (!state.dragging) return;
    const delta = e.clientX - dragStartX;
    dragStartX = e.clientX;
    dragMoved += Math.abs(delta);
    if (dragMoved > 6) document.body.classList.add("is-dragging");
    state.scroll -= delta / ks;         /* photos follow the pointer */
});

window.addEventListener("pointerup", () => {
    state.dragging = false;
    document.body.classList.remove("is-dragging");
});

/* Click a photo to bring it forward; click again, click empty space, or press Esc to release */
photos.forEach((el, i) => {
    el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dragMoved > 6) return;      /* that was a drag, not a click */
        photos.forEach((p) => p.classList.remove("is-focused"));
        if (state.focused === i) {
            state.focused = -1;
        } else {
            state.focused = i;
            el.classList.add("is-focused");
        }
    });
});

function releaseFocus() {
    state.focused = -1;
    photos.forEach((p) => p.classList.remove("is-focused"));
}

window.addEventListener("click", () => { if (dragMoved <= 6) releaseFocus(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape") releaseFocus(); });

window.addEventListener("resize", applySizes);


/* =========================
   START (wait for every image so sizes use the real aspect ratios)
========================= */

const ready = photos.map((img) =>
    (img.complete && img.naturalWidth)
        ? Promise.resolve()
        : new Promise((res) => {
            img.addEventListener("load", res, { once: true });
            img.addEventListener("error", res, { once: true });
        })
);

Promise.all(ready).then(() => {
    measurePhotos();
    applySizes();
    requestAnimationFrame((t) => { last = t; frame(t); });
});