/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");

/* Cloudflare Worker endpoint for OpenAI requests */
const CLOUDFLARE_ENDPOINT = "https://loreal-worker.ejb8525.workers.dev/";

/* Keep track of selected products */
let selectedProducts = [];

/* Store the full conversation history for follow-ups */
let conversationHistory = [];

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card${
      selectedProducts.some((p) => p.id === product.id) ? " selected" : ""
    }" 
         data-id="${product.id}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <button class="product-details-btn" data-id="${
          product.id
        }">Details</button>
      </div>
    </div>
  `
    )
    .join("");

  // Add click event listeners for selection
  document.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      // Prevent selection if details button is clicked
      if (event.target.classList.contains("product-details-btn")) return;
      const id = card.getAttribute("data-id");
      const product = products.find((p) => p.id == id);

      // Toggle selection
      const index = selectedProducts.findIndex((p) => p.id == id);
      if (index === -1) {
        selectedProducts.push(product);
      } else {
        selectedProducts.splice(index, 1);
      }
      displayProducts(products); // Update grid highlight
      updateSelectedProducts();
    });
  });

  // Add click event listeners for details buttons
  document.querySelectorAll(".product-details-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent card selection
      const id = btn.getAttribute("data-id");
      const product = products.find((p) => p.id == id);
      showProductDescription(product);
    });
  });
}

/* Show product description in a modal overlay */
function showProductDescription(product) {
  // Create overlay HTML
  const overlay = document.createElement("div");
  overlay.className = "product-description-overlay";
  overlay.innerHTML = `
    <div class="product-description-modal">
      <button class="product-description-close" title="Close">&times;</button>
      <h3>${product.name}</h3>
      <p>${product.description || "No description available."}</p>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close modal when clicking close button or outside modal
  overlay.querySelector(".product-description-close").onclick = () => {
    document.body.removeChild(overlay);
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };
}

/* Save selected products to localStorage */
function saveSelectedProducts() {
  localStorage.setItem("selectedProducts", JSON.stringify(selectedProducts));
}

/* Load selected products from localStorage */
function loadSelectedProducts() {
  const saved = localStorage.getItem("selectedProducts");
  if (saved) {
    try {
      selectedProducts = JSON.parse(saved);
    } catch {
      selectedProducts = [];
    }
  }
}

/* Update the Selected Products section */
function updateSelectedProducts() {
  saveSelectedProducts();
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `<div class="placeholder-message">No products selected</div>`;
    // Remove Clear All button if present
    const clearBtn = document.getElementById("clearSelectedBtn");
    if (clearBtn) clearBtn.remove();
    return;
  }
  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-product-item">
        <img src="${product.image}" alt="${product.name}" width="40" height="40" style="border-radius:6px;">
        <span>${product.name}</span>
        <button class="selected-product-remove" data-id="${product.id}" title="Remove">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `
    )
    .join("");

  // Add Clear All button if not present
  if (!document.getElementById("clearSelectedBtn")) {
    const clearBtn = document.createElement("button");
    clearBtn.id = "clearSelectedBtn";
    clearBtn.textContent = "Clear All";
    clearBtn.className = "generate-btn";
    clearBtn.style.marginTop = "10px";
    clearBtn.onclick = () => {
      selectedProducts = [];
      updateSelectedProducts();
      // Re-render grid to remove highlights
      loadProducts().then((products) =>
        displayProducts(
          products.filter(
            (product) => product.category === categoryFilter.value
          )
        )
      );
    };
    selectedProductsList.parentElement.appendChild(clearBtn);
  }

  // Add event listeners for remove buttons
  document.querySelectorAll(".selected-product-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = btn.getAttribute("data-id");
      selectedProducts = selectedProducts.filter((p) => p.id != id);
      updateSelectedProducts();
      // Re-render grid to remove highlight
      loadProducts().then((products) =>
        displayProducts(
          products.filter(
            (product) => product.category === categoryFilter.value
          )
        )
      );
    });
  });
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(filteredProducts);
});

/* Helper function to render all chat messages in the chat window */
function renderChatHistory(showThinking = false) {
  chatWindow.innerHTML = conversationHistory
    .filter((msg) => msg.role !== "system")
    .map((msg) => {
      // Don't show JSON requests (the initial user message with JSON)
      if (
        msg.role === "user" &&
        msg.content.includes("Here are my selected products:") &&
        msg.content.includes("{") &&
        msg.content.includes("}")
      ) {
        return ""; // skip displaying this message
      }
      // Style each message in its own box
      const boxClass =
        msg.role === "user" ? "chat-message-user" : "chat-message-assistant";
      const label =
        msg.role === "user"
          ? "<strong>You:</strong>"
          : "<strong>Advisor:</strong>";
      return `<div class="${boxClass}">${label}<br>${renderMarkdown(
        msg.content
      )}</div>`;
    })
    .join("");
  // Show a temporary "Thinking..." box if requested
  if (showThinking) {
    chatWindow.innerHTML += `<div class="chat-message-assistant"><strong>Advisor:</strong><br>Thinking...</div>`;
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
}

/* This function sends selected products to Cloudflare Worker and shows the routine */
generateRoutineBtn.addEventListener("click", async () => {
  // Show "Thinking..." box while waiting for response
  renderChatHistory(true);

  const productsForAI = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  // Start a new conversation history with system and user messages
  conversationHistory = [
    {
      role: "system",
      content:
        "You are a helpful L'Oreal beauty routine assistant. Only answer questions about the generated routine, skincare, haircare, makeup, fragrance, or other beauty topics. If asked about anything else, politely refuse. Keep your responses concise and focused on beauty advice. You should proactively recommend L'Oreal products based on the user's selected products and routine. Again, keep your responses concise. Remove preambles, such as 'Sure, here is your routine:' or 'Here is your routine:', or 'Certainly!",
    },
    {
      role: "user",
      content: `Here are my selected products:\n${JSON.stringify(
        productsForAI,
        null,
        2
      )}\nPlease generate a step-by-step routine using these products.`,
    },
  ];

  try {
    const response = await fetch(CLOUDFLARE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: conversationHistory,
        max_tokens: 500,
      }),
    });

    const data = await response.json();

    if (
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      conversationHistory.push({
        role: "assistant",
        content: data.choices[0].message.content,
      });
      renderChatHistory();
      chatWindow.scrollTop = chatWindow.scrollHeight;
    } else {
      chatWindow.innerHTML =
        "<div class='placeholder-message'>Sorry, I couldn't generate a routine. Please try again.</div>";
    }
  } catch (error) {
    chatWindow.innerHTML =
      "<div class='placeholder-message'>Error connecting to the routine generator. Please try again.</div>";
  }
});

/* Chat form submission handler - send follow-up questions */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const userInputElem = document.getElementById("userInput");
  const userInput = userInputElem.value.trim();
  if (!userInput) return;

  // Clear the input field immediately after submit
  userInputElem.value = "";

  conversationHistory.push({
    role: "user",
    content: userInput,
  });

  // Show "Thinking..." box while waiting for response
  renderChatHistory(true);

  try {
    const response = await fetch(CLOUDFLARE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: conversationHistory,
        max_tokens: 500,
      }),
    });

    const data = await response.json();

    if (
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      conversationHistory.push({
        role: "assistant",
        content: data.choices[0].message.content,
      });
      renderChatHistory();
      chatWindow.scrollTop = chatWindow.scrollHeight;
    } else {
      chatWindow.innerHTML =
        "<div class='placeholder-message'>Sorry, I couldn't answer that. Please try again.</div>";
    }
  } catch (error) {
    chatWindow.innerHTML =
      "<div class='placeholder-message'>Error connecting to the routine generator. Please try again.</div>";
  }
});

/* Helper function to convert basic markdown to HTML */
function renderMarkdown(markdown) {
  // Headings
  markdown = markdown.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  markdown = markdown.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  markdown = markdown.replace(/^# (.*$)/gim, "<h1>$1</h1>");
  // Bold
  markdown = markdown.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
  // Italic
  markdown = markdown.replace(/\*(.*?)\*/gim, "<em>$1</em>");
  // Unordered lists
  markdown = markdown.replace(/^\s*[-*]\s+(.*)$/gim, "<li>$1</li>");
  markdown = markdown.replace(/(<li>.*<\/li>)/gim, "<ul>$1</ul>");
  // Links
  markdown = markdown.replace(
    /\[([^\[]+)\]\(([^)]+)\)/gim,
    '<a href="$2" target="_blank">$1</a>'
  );
  // Line breaks
  markdown = markdown.replace(/\n/g, "<br>");
  return markdown;
}

/* On page load, restore selected products from localStorage */
loadSelectedProducts();
updateSelectedProducts();

/* Show selected products on page load */
updateSelectedProducts();
