/**
 * Spanish (US Hispanic market) copy for the /es pages, brand-conditional the
 * same way lib/brand-copy.ts is. "Llantas/rines" is the vocabulary used by
 * Mexican-Spanish speakers across FL and TX tire shops — not "neumáticos".
 * Tire sizes, SKUs and lead-pipeline VALUES stay in English.
 */
const KEY = process.env.NEXT_PUBLIC_BRAND_KEY ?? process.env.BRAND_KEY ?? "RHINO";

const RHINO_ES = {
  heroTagline: "Distribuidor mayorista de llantas y rines · Orlando FL · Dallas TX",
  homeTitle: "Rhino Tire USA — Llantas y Rines al Mayoreo | Orlando FL y Dallas TX",
  homeDescription:
    "Distribuidor mayorista de llantas para remolque, auto, camioneta y camión, rines y refacciones. Bodegas en Orlando, FL y Dallas, TX. Precios de distribuidor para llanteras, fabricantes de remolques y flotillas.",
  heroBlurb:
    "Distribuidor mayorista de llantas para remolque, auto, camioneta y camión, rines y refacciones para remolque. Bodegas en Orlando, FL y Dallas, TX. Precios de distribuidor para llanteras, fabricantes de remolques y flotillas.",
  deliveryStat: "Entregas semanales en toda la Florida",
  citiesLine: "Orlando, FL · Dallas, TX",
  dealerBenefits: [
    "Precios de distribuidor por niveles (A–D) en todo el catálogo",
    "Bodegas en Orlando y Dallas — entregas semanales en la Florida",
    "Programas de tarimas y contenedores, cargas mixtas bienvenidas",
    "Referencias de clientes — las solicitudes de instalación de nuestro sitio se envían a talleres de la red en toda la Florida",
  ],
  quoteDescription:
    "Obtenga precios de mayoreo en llantas, rines y refacciones para remolque. Díganos las medidas y cantidades — un representante le responde dentro de un día hábil.",
  dealerDescription:
    "Solicite una cuenta de distribuidor de Rhino Tire USA: precios por niveles en llantas, rines y refacciones, bodegas en Florida y Texas, rutas de entrega semanales.",
  findDescription:
    "Ingrese la medida de su llanta y su código postal para encontrar instalación profesional cerca de usted.",
};

const EVERFLOW_ES: typeof RHINO_ES = {
  heroTagline: "Distribuidor mayorista de llantas y rines · Dallas TX",
  homeTitle: "Everflow Tires & Wheels — Llantas y Rines al Mayoreo en Dallas, TX",
  homeDescription:
    "Distribuidor mayorista de llantas y rines en Dallas, TX. Llantas para remolque, auto, camioneta y camión a precios de distribuidor para llanteras, flotillas y fabricantes de remolques en Dallas–Fort Worth.",
  heroBlurb:
    "Distribuidor mayorista de llantas para remolque, auto, camioneta y camión, rines y refacciones para remolque en Dallas, TX. Precios de distribuidor para llanteras, fabricantes de remolques y flotillas de Dallas–Fort Worth.",
  deliveryStat: "Recolección y entrega local en Dallas–Fort Worth",
  citiesLine: "Dallas, TX",
  dealerBenefits: [
    "Precios de distribuidor por niveles (A–D) en todo el catálogo",
    "Bodega en Dallas, TX — recolección y entrega local en DFW",
    "Programas de tarimas y contenedores, cargas mixtas bienvenidas",
    "Referencias de clientes — las solicitudes de instalación de nuestro sitio se envían a talleres de la red en Dallas–Fort Worth",
  ],
  quoteDescription:
    "Obtenga precios de mayoreo en llantas, rines y refacciones para remolque. Díganos las medidas y cantidades — un representante le responde dentro de un día hábil.",
  dealerDescription:
    "Solicite una cuenta de distribuidor de Everflow Tires & Wheels: precios por niveles en llantas, rines y refacciones, con recolección en bodega y entrega local en DFW.",
  findDescription:
    "Ingrese la medida de su llanta y su código postal para encontrar instalación profesional cerca de usted.",
};

export const ES_COPY = KEY === "EVERFLOW" ? EVERFLOW_ES : RHINO_ES;
