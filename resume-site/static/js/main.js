/* ==========================================================
   Matin Karimov — frontend logic
   - Loads resume data from /api/resume
   - Renders with textContent (no innerHTML) to avoid XSS
   - Contact form posts to /api/contact with client-side checks
   ========================================================== */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Small helper: builds an element; children may be strings or nodes. */
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "style") node.style.cssText = value;
        else node.setAttribute(key, value === true ? "" : value);
      }
    }
    node.append(...children.filter((c) => c !== null && c !== undefined));
    return node;
  }

  /* ---------- Renderers ---------- */

  function renderHero(data) {
    $("#heroRole").textContent = data.role;
    const name = $("#heroName");
    name.textContent = data.name;
    name.dataset.text = data.name;
    $("#heroSummary").textContent = data.summary;
    $("#aboutText").textContent = data.summary;
    $("#infoRole").textContent = data.role;
    $("#infoEmail").textContent = data.email;
    $("#contactEmail").textContent = data.email;
    $("#contactEmail").href = "mailto:" + data.email;
    document.title = "رزومه | " + data.name;
  }

  function renderExperience(items) {
    const list = $("#experienceList");
    items.forEach((job) => {
      list.append(
        h("article", { class: "job reveal" },
          h("div", { class: "job-head" },
            h("div", null,
              h("h3", null, job.title),
              h("p", { class: "job-company" }, job.company)
            ),
            h("span", { class: "job-period" }, job.period)
          ),
          h("ul", null, ...job.highlights.map((t) => h("li", null, t)))
        )
      );
    });
  }

  function renderSkills(items) {
    const list = $("#skillsList");
    items.forEach((skill) => {
      const level = Math.max(0, Math.min(100, Number(skill.level) || 0));
      list.append(
        h("div", { class: "card skill reveal" },
          h("div", { class: "skill-top" },
            h("span", null, skill.name),
            h("span", { class: "pct" }, level + "%")
          ),
          h("div", { class: "skill-bar", role: "progressbar", "aria-valuenow": level, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": skill.name },
            h("div", { class: "skill-fill", "data-w": level, style: "--w:" + level + "%" })
          )
        )
      );
    });
  }

  function renderProjects(items) {
    const list = $("#projectsList");
    items.forEach((p, i) => {
      list.append(
        h("article", { class: "card project reveal" },
          h("span", { class: "project-index" }, "PROJECT " + String(i + 1).padStart(2, "0")),
          h("h3", null, p.name),
          h("p", null, p.description),
          h("ul", { class: "tags" }, ...p.tags.map((t) => h("li", { class: "tag" }, t))),
          h("a", { class: "project-link", href: p.link || "#", target: "_blank", rel: "noopener noreferrer" }, "مشاهده پروژه →")
        )
      );
    });
  }

  function renderEducation(items) {
    const list = $("#educationList");
    items.forEach((e) => {
      list.append(
        h("div", { class: "card edu reveal" },
          h("div", null,
            h("h3", null, e.degree),
            h("p", null, e.school)
          ),
          h("time", null, e.period)
        )
      );
    });
  }

  function renderSocials(items) {
    const list = $("#socialsList");
    items.forEach((s) => {
      list.append(h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.name));
    });
  }

  /* ---------- Interactions ---------- */

  function setupReveal() {
    const targets = document.querySelectorAll(".reveal, .section");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("visible"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        entry.target.querySelectorAll(".skill-fill").forEach(animateBar);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    targets.forEach((el) => io.observe(el));
  }

  function animateBar(bar) {
    bar.style.width = bar.dataset.w + "%";
  }

  function setupNav() {
    const header = $("#siteHeader");
    const toggle = $("#menuToggle");
    const nav = $("#mainNav");

    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "بستن منو" : "باز کردن منو");
      nav.classList.toggle("open", open);
    });
    nav.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("open");
      })
    );

    const sections = [...document.querySelectorAll("main section[id]")];
    const links = [...nav.querySelectorAll("a")];
    let ticking = false;

    function onScroll() {
      header.classList.toggle("scrolled", window.scrollY > 10);
      const y = window.scrollY + 140;
      let current = "";
      sections.forEach((s) => { if (s.offsetTop <= y) current = s.id; });
      links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + current));
      ticking = false;
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
    }, { passive: true });
    onScroll();
  }

  function setupPrint() {
    $("#printBtn").addEventListener("click", () => {
      // Make sure all bars are filled before printing
      document.querySelectorAll(".skill-fill").forEach(animateBar);
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
      window.print();
    });
  }

  function setupContactForm() {
    const form = $("#contactForm");
    const status = $("#formStatus");
    const submit = $("#submitBtn");

    const rules = {
      name: (v) => (v.trim() ? "" : "نام را وارد کنید."),
      email: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? "" : "یک ایمیل معتبر وارد کنید."),
      message: (v) => (v.trim().length >= 5 ? "" : "پیام باید حداقل ۵ کاراکتر باشد."),
    };

    function showFieldErrors(errors) {
      Object.keys(rules).forEach((key) => {
        const field = form.elements[key].closest(".field");
        const msg = errors[key] || "";
        field.classList.toggle("invalid", Boolean(msg));
        field.querySelector(".field-error").textContent = msg;
      });
    }

    function setStatus(text, type) {
      status.textContent = text;
      status.className = "form-status" + (type ? " " + type : "");
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));

      const errors = {};
      Object.keys(rules).forEach((key) => {
        const msg = rules[key](data[key] || "");
        if (msg) errors[key] = msg;
      });
      showFieldErrors(errors);
      if (Object.keys(errors).length) {
        setStatus("لطفاً خطاهای فرم را برطرف کنید.", "error");
        return;
      }

      submit.disabled = true;
      submit.textContent = "در حال ارسال...";
      setStatus("", "");

      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (body.fields) showFieldErrors(body.fields);
          setStatus(body.error || "ارسال پیام با خطا مواجه شد.", "error");
          return;
        }
        form.reset();
        showFieldErrors({});
        setStatus(body.message || "پیام شما ارسال شد.", "ok");
      } catch (err) {
        setStatus("اتصال به سرور برقرار نشد. دوباره تلاش کنید.", "error");
      } finally {
        submit.disabled = false;
        submit.textContent = "ارسال پیام";
      }
    });
  }

  function setupFooter() {
    $("#year").textContent = new Date().getFullYear();
  }

  /* ---------- Load data ---------- */

  async function loadResume() {
    const res = await fetch("/api/resume", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function init() {
    setupNav();
    setupPrint();
    setupContactForm();
    setupFooter();

    try {
      const data = await loadResume();
      renderHero(data);
      renderExperience(data.experience || []);
      renderSkills(data.skills || []);
      renderProjects(data.projects || []);
      renderEducation(data.education || []);
      renderSocials(data.socials || []);
    } catch (err) {
      const note = h("p", { class: "muted", style: "text-align:center" }, "اطلاعات رزومه در حال حاضر بارگذاری نشد.");
      $("#about").querySelector(".container").prepend(note);
    }

    // Re-run observers after rendering dynamic content
    setupReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
