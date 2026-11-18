
(function () {
  "use strict";

  // ==========================================
  // CONFIGURATION
  // ==========================================
  const CONFIG = window.SITE_CONFIG || {};
  const CAPACITY = Math.max(1, Number(CONFIG.capacity) || 40);
  const LINKS = CONFIG.links || {};
  const API_URL = String(CONFIG.apiUrl || "").trim();
  const POLL_INTERVAL = 30000;

  // ==========================================
  // DOM HELPERS
  // ==========================================
  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const setText = (selector, value) => {
    $$(selector).forEach(el => {
      el.textContent = value;
    });
  };

  const isPlaceholder = url =>
    !url || /REPLACE/i.test(String(url));

  const clampCount = value => {
    const count = Number(value);
    if (!Number.isFinite(count)) return null;
    return Math.min(CAPACITY, Math.max(0, Math.floor(count)));
  };

  // ==========================================
  // APPLICATION STATE
  // ==========================================
  const state = {
    count: null,
    source: "none",
    saved: false,
    submitting: false,
    polling: false,
    wasFull: false
  };

  const form = $("#regForm");
  const submitButton = $("#submitBtn");
  const formStatus = $("#formStatus");

  // ==========================================
  // CONFIGURED LINKS
  // ==========================================
  $$("[data-link]").forEach(element => {
    const key = element.getAttribute("data-link");
    const url = LINKS[key];

    if (url && !isPlaceholder(url)) {
      element.setAttribute("href", url);
    } else if (key === "form") {
      element.hidden = true;
    }
  });

  if (isPlaceholder(LINKS.form) && $("#formAlt")) {
    $("#formAlt").hidden = true;
  }

  if (CONFIG.contactEmail && $("#contactMail")) {
    $("#contactMail").textContent = CONFIG.contactEmail;
  }

  // ==========================================
  // MOBILE NAVIGATION
  // ==========================================
  const menuButton = $("#menuBtn");
  const navigation = $("#nav");

  if (menuButton && navigation) {
    menuButton.addEventListener("click", () => {
      const isOpen = navigation.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(isOpen));
    });

    $$("a", navigation).forEach(link => {
      link.addEventListener("click", () => {
        navigation.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        navigation.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ==========================================
  // SEAT GRID GENERATION
  // ==========================================
  $$("[data-grid]").forEach(grid => {
    if (grid.children.length) return;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < CAPACITY; i++) {
      const seat = document.createElement("i");
      seat.style.setProperty("--i", String(i));
      seat.setAttribute("aria-hidden", "true");
      fragment.appendChild(seat);
    }

    grid.appendChild(fragment);
  });

  // ==========================================
  // REGISTRATION STATUS
  // ==========================================
  function getDerivedState() {
    const known = typeof state.count === "number";

    return {
      known,
      count: state.count,
      remaining: known
        ? Math.max(0, CAPACITY - state.count)
        : null,
      full: known && state.count >= CAPACITY,
      percentage: known
        ? Math.min(100, Math.round(
            (state.count / CAPACITY) * 100
          ))
        : 0
    };
  }

  // ==========================================
  // NOTIFICATION SYSTEM
  // ==========================================
  function showNotice(type, title, message, actions = []) {
    if (!formStatus) return;

    formStatus.replaceChildren();

    const notice = document.createElement("div");
    notice.className = `notice ${type}`;
    notice.setAttribute(
      "role",
      type === "error" ? "alert" : "status"
    );

    const heading = document.createElement("strong");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = message;

    notice.append(heading, paragraph);

    const validActions = actions.filter(action =>
      action &&
      action.label &&
      action.link &&
      !isPlaceholder(LINKS[action.link])
    );

    if (validActions.length) {
      const actionRow = document.createElement("div");
      actionRow.className = "acts";

      validActions.forEach(action => {
        const link = document.createElement("a");

        link.className =
          "btn btn-sm " +
          (action.ghost ? "btn-ghost" : "btn-primary");

        link.textContent = action.label;
        link.href = LINKS[action.link];
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        actionRow.appendChild(link);
      });

      notice.appendChild(actionRow);
    }

    formStatus.appendChild(notice);
  }

  function showFullNotice() {
    showNotice(
      "warn",
      `All ${CAPACITY} seats are taken`,
      "Join the community chat to hear when the next batch opens.",
      [{
        label: "Join the community",
        link: "community",
        ghost: true
      }]
    );
  }

  // ==========================================
  // RENDER INTERFACE
  // ==========================================
  function render() {
    const data = getDerivedState();

    setText(
      "[data-bind='count']",
      data.known ? String(data.count) : "–"
    );

    setText(
      "[data-bind='remaining']",
      data.known ? String(data.remaining) : "–"
    );

    setText(
      "[data-bind='status']",
      data.full ? "Full" : data.known ? "Open" : "Checking"
    );

    $$("[data-status]").forEach(element => {
      element.classList.toggle("is-full", data.full);
      element.classList.toggle("is-unavailable", !data.known);
    });

    $$("[data-grid]").forEach(grid => {
      $$("i", grid).forEach((seat, index) => {
        seat.classList.toggle(
          "on",
          data.known && index < data.count
        );
      });

      grid.setAttribute(
        "aria-label",
        data.known
          ? `${data.count} of ${CAPACITY} seats taken`
          : "Seat map, live count unavailable"
      );
    });

    const rail = $("#rail");

    if (rail) {
      const progress = rail.firstElementChild;

      if (progress) {
        progress.style.setProperty(
          "--p",
          `${data.percentage}%`
        );
      }

      rail.setAttribute("aria-valuemin", "0");
      rail.setAttribute("aria-valuemax", String(CAPACITY));
      rail.setAttribute(
        "aria-valuenow",
        String(data.known ? data.count : 0)
      );
    }

    const note =
      state.source === "live"
        ? "Live count from registrations."
        : state.source === "manual"
          ? "Count updated by the organizers."
          : "Live count is not available right now. The organizers confirm seats.";

    setText("[data-bind='note']", note);

    if (submitButton && !state.saved && !state.submitting) {
      submitButton.disabled = data.full;
      submitButton.textContent = data.full
        ? "Registration full"
        : "Register now";
    }

    if (data.full && !state.wasFull && !state.saved) {
      showFullNotice();
    }

    state.wasFull = data.full;
  }

  // ==========================================
  // FORM VALIDATION
  // ==========================================
  const FREE_EMAIL_PROVIDER =
    /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|icloud|proton|protonmail)\./i;

  const validationRules = {
    name: value =>
      value.trim().length >= 2
        ? ""
        : "Enter your full name.",

    email: value => {
      const email = value.trim();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return "Enter a valid college email, like name@college.edu.";
      }

      if (FREE_EMAIL_PROVIDER.test(email)) {
        return "Use your college email address, not a personal one.";
      }

      return "";
    },

    college: value =>
      value.trim().length >= 3
        ? ""
        : "Enter your college name.",

    year: value =>
      value ? "" : "Choose your year of study.",

    branch: value =>
      value.trim().length >= 2
        ? ""
        : "Enter your branch or department."
  };

  const getField = name => $("#f-" + name);

  function validateField(name) {
    const field = getField(name);
    const errorElement = $("#err-" + name);

    if (!field) return "Field unavailable.";

    const message = validationRules[name](field.value);

    if (errorElement) {
      errorElement.textContent = message;
    }

    field.setAttribute(
      "aria-invalid",
      message ? "true" : "false"
    );

    return message;
  }

  function getSelectedInterests() {
    if (!form) return [];

    return $$(
      'input[name="interests"]:checked',
      form
    ).map(input => input.value);
  }

  function validateInterests() {
    const valid = getSelectedInterests().length > 0;
    const errorElement = $("#err-interests");

    if (errorElement) {
      errorElement.textContent = valid
        ? ""
        : "Pick at least one interest.";
    }

    return valid;
  }

  function validateForm() {
    let firstInvalidField = null;

    Object.keys(validationRules).forEach(name => {
      if (validateField(name) && !firstInvalidField) {
        firstInvalidField = getField(name);
      }
    });

    if (!validateInterests() && !firstInvalidField) {
      firstInvalidField = $(
        'input[name="interests"]',
        form
      );
    }

    return firstInvalidField;
  }

  if (form) {
    Object.keys(validationRules).forEach(name => {
      const field = getField(name);
      if (!field) return;

      field.addEventListener("blur", () => {
        validateField(name);
      });

      field.addEventListener("input", () => {
        if (field.getAttribute("aria-invalid") === "true") {
          validateField(name);
        }
      });
    });

    $$('input[name="interests"]', form).forEach(input => {
      input.addEventListener("change", () => {
        const error = $("#err-interests");
        if (error && error.textContent) {
          validateInterests();
        }
      });
    });
  }

  // ==========================================
  // BACKEND API
  // ==========================================
  function buildApiUrl(query) {
    const separator = API_URL.includes("?") ? "&" : "?";
    return API_URL + separator + query;
  }

  function useFallbackCount() {
    const manualCount = clampCount(CONFIG.manualRegistered);

    if (manualCount !== null) {
      state.count = manualCount;
      state.source = "manual";
    } else {
      state.count = null;
      state.source = "none";
    }

    render();
  }

  function loadCount() {
    if (!API_URL) {
      useFallbackCount();
      return Promise.resolve();
    }

    if (state.polling) return Promise.resolve();

    state.polling = true;

    return fetch(
      buildApiUrl("action=count&t=" + Date.now()),
      { method: "GET", cache: "no-store" }
    )
      .then(response => {
        if (!response.ok) throw new Error("API error");
        return response.json();
      })
      .then(result => {
        const count = result && clampCount(result.count);

        if (count !== null) {
          state.count = count;
          state.source = "live";
          render();
        } else if (state.source !== "live") {
          useFallbackCount();
        }
      })
      .catch(() => {
        if (state.source !== "live") {
          useFallbackCount();
        }
      })
      .finally(() => {
        state.polling = false;
      });
  }

  function saveRegistration(data) {
    if (!API_URL) {
      return Promise.resolve({ status: "unsaved" });
    }

    return fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(data)
    })
      .then(response => {
        if (!response.ok) throw new Error("Registration failed");
        return response.json();
      })
      .catch(() => ({ status: "error" }));
  }

  // ==========================================
  // REGISTRATION SUBMISSION
  // ==========================================
  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();

      if (state.submitting || state.saved) return;

      const invalidField = validateForm();

      if (invalidField) {
        invalidField.focus();

        showNotice(
          "error",
          "Check the highlighted fields",
          "Fix the messages shown under each field, then register again."
        );

        return;
      }

      if (getDerivedState().full) {
        render();
        return;
      }

      // Honeypot protection against basic bots.
      const honeypot = $("#f-website");
      if (honeypot && honeypot.value.trim()) return;

      const registrationData = {
        name: getField("name").value.trim(),
        email: getField("email").value.trim().toLowerCase(),
        college: getField("college").value.trim(),
        year: getField("year").value,
        branch: getField("branch").value.trim(),
        interests: getSelectedInterests(),
        website: ""
      };

      state.submitting = true;

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Saving…";
      }

      saveRegistration(registrationData).then(result => {
        const status = result && result.status;
        const count = result && clampCount(result.count);

        if (count !== null) {
          state.count = count;
          state.source = "live";
        }

        if (status === "saved" || status === "duplicate") {
          state.saved = true;
          state.submitting = false;
          render();

          if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent =
              status === "saved" ? "Registered" : "Already registered";
          }

          showNotice(
            "success",
            status === "saved"
              ? "You are registered"
              : "You have already registered",
            status === "saved"
              ? "Your details are saved with the organizers. Join the community chat for onboarding updates."
              : "This email already holds a seat. Join the community chat for updates.",
            [{
              label: "Join the community",
              link: "community"
            }]
          );

          return;
        }

        state.submitting = false;

        if (status === "full") {
          state.count = CAPACITY;
          state.source = "live";
          render();
          showFullNotice();
          return;
        }

        if (status === "unsaved") {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Register now";
          }

          showNotice(
            "warn",
            "One more step to reserve your seat",
            "Your details look good. Finish on the official registration form to hold your seat.",
            [
              {
                label: "Open registration form",
                link: "form"
              },
              {
                label: "Join the community",
                link: "community",
                ghost: true
              }
            ]
          );

          return;
        }

        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Register now";
        }

        showNotice(
          "error",
          "Your registration was not saved",
          "Something went wrong while saving. Try again in a moment, or use the official registration form.",
          [{
            label: "Open registration form",
            link: "form"
          }]
        );
      });
    });
  }

  // ==========================================
  // COPY EMAIL
  // ==========================================
  const copyButton = $("#copyMail");

  if (copyButton) {
    copyButton.addEventListener("click", () => {
      const emailElement = $("#contactMail");
      if (!emailElement) return;

      const email = emailElement.textContent.trim();

      function copiedLabel() {
        copyButton.textContent = "Copied";

        window.setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 1600);
      }

      function fallbackCopy() {
        const range = document.createRange();
        range.selectNodeContents(emailElement);

        const selection = window.getSelection();

        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email)
          .then(copiedLabel)
          .catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================
  render();
  loadCount();

  if (API_URL) {
    window.setInterval(() => {
      if (!document.hidden) {
        loadCount();
      }
    }, POLL_INTERVAL);
  }

})();
