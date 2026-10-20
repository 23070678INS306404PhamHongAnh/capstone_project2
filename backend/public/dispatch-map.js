(() => {
  let map;
  let markers;

  const message = document.getElementById("map-message");
  const details = document.getElementById("map-driver-details");

  function position(latitude, longitude) {
    if (
      latitude == null || longitude == null ||
      latitude === "" || longitude === ""
    ) return null;

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) return null;

    return [lat, lng];
  }

  function text(tag, value) {
    const item = document.createElement(tag);
    item.textContent = value;
    return item;
  }

  function clearMap() {
    markers?.clearLayers();
    details.replaceChildren();
    message.textContent = "Loading order locations…";
  }

  window.renderDispatchMap = result => {
    if (!window.L) {
      message.textContent =
        "Map library could not load. Use the driver cards below.";
      return;
    }

    if (!map) {
      map = L.map("dispatch-map").setView([10.78, 106.70], 12);

      L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
      ).addTo(map);

      markers = L.layerGroup().addTo(map);
    }

    clearMap();

    const order = result.order;
    const bounds = [];

    const pickup = position(
      order.pickup_latitude,
      order.pickup_longitude
    );

    const delivery = position(
      order.latitude,
      order.longitude
    );

    for (const [point, label, color] of [
      [pickup, `Pickup: ${order.restaurant_name}`, "#ff942f"],
      [delivery, `Delivery: ${order.delivery_address}`, "#ee4d2d"]
    ]) {
      if (!point) continue;

      bounds.push(point);

      L.circleMarker(point, {
        radius: 11,
        color: "#ffffff",
        weight: 3,
        fillColor: color,
        fillOpacity: 1
      })
        .addTo(markers)
        .bindPopup(text("strong", label));
    }

    if (pickup && delivery) {
      L.polyline([pickup, delivery], {
        color: "#ee4d2d",
        weight: 3,
        dashArray: "7 9"
      }).addTo(markers);
    }

    const eligible = result.candidates.filter(driver => driver.eligible);

    // Show unavailable drivers when no eligible candidate exists.
    const visible = eligible.length ? eligible : result.candidates;
    let shown = 0;

    for (const driver of visible) {
      const point = position(driver.latitude, driver.longitude);

      if (!point) continue;

      shown++;
      bounds.push(point);

      const recommended =
        Number(driver.id) === Number(result.recommended_driver_id);

      const color = !driver.eligible
        ? "#929aa2"
        : recommended ? "#24885a" : "#ee4d2d";

      const icon = L.divIcon({
        className: "",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        html:
          `<span style="display:grid;place-items:center;` +
          `width:40px;height:40px;border-radius:50%;` +
          `background:${color};border:3px solid white;` +
          `box-shadow:0 2px 8px #0003;font-size:23px">🛵</span>`
      });

      L.marker(point, {
        icon,
        title: `${driver.full_name} · ${driver.plate_number}`
      })
        .addTo(markers)
        .on("click", () => {
          details.replaceChildren(
            text("h3", driver.full_name),
            text("p", `${driver.driver_code} · ${driver.plate_number}`),
            text("p", `Pickup distance: ${driver.pickup_km ?? "—"} km`),
            text("p", `Estimated delivery: ${driver.eta_minutes ?? "—"} min`),
            text("p", `Active orders: ${driver.active_orders} / 3`),
            text("p", `DSS score: ${driver.score ?? "—"}`)
          );

          if (!driver.eligible) {
            details.append(
              text("p", driver.reasons.join(" "))
            );
            return;
          }

          const assigned =
            Number(order.driver_id) === Number(driver.id);

          const button = text(
            "button",
            assigned
              ? "Currently Assigned"
              : recommended
                ? "Approve Recommendation"
                : "Assign with Reason"
          );

          button.type = "button";
          button.disabled = assigned;

          button.addEventListener("click", async () => {
            const current =
              document.getElementById("dispatch-order").value;

            if (String(order.id) !== current) {
              message.textContent =
                "Order changed. Refresh recommendations before assigning.";
              return;
            }

            button.disabled = true;

            try {
              await window.approveAssignment(driver.id);
            } finally {
              if (button.isConnected) button.disabled = assigned;
            }
          });

          details.appendChild(button);
        });
    }

    if (bounds.length) {
      map.fitBounds(bounds, {
        padding: [35, 35],
        maxZoom: 15
      });
    }

    map.invalidateSize();

    message.textContent =
      `${shown} vehicles shown. Green = recommended; ` +
      `orange-red = eligible; grey = unavailable. ` +
      `Positions are stored coordinates, not live GPS. ` +
      `Dashed lines are schematic, not road navigation.`;
  };

  document.getElementById("dispatch-order")
    .addEventListener("change", clearMap);

  document.getElementById("refresh-dispatch")
    .addEventListener("click", clearMap);
})();
