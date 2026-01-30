import { fetch } from "undici";

export const handler = async (input: any) => {
  const location = input?.location?.trim?.() || "San Francisco";
  const days = Math.min(Math.max(input?.days ?? 3, 1), 7);

  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.searchParams.set("name", location);
  geocodeUrl.searchParams.set("count", "1");

  const geoRes = await fetch(geocodeUrl);
  if (!geoRes.ok) {
    return { error: `Geocoding failed: ${geoRes.status}` };
  }
  const geoJson = (await geoRes.json()) as any;
  const first = geoJson?.results?.[0];
  if (!first) {
    return { error: `Location not found: ${location}` };
  }

  const latitude = first.latitude;
  const longitude = first.longitude;
  const resolvedName = first.name ?? location;

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(latitude));
  forecastUrl.searchParams.set("longitude", String(longitude));
  forecastUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  forecastUrl.searchParams.set("forecast_days", String(days));
  forecastUrl.searchParams.set("timezone", "auto");

  const forecastRes = await fetch(forecastUrl);
  if (!forecastRes.ok) {
    return { error: `Forecast request failed: ${forecastRes.status}` };
  }
  const forecastJson = (await forecastRes.json()) as any;
  const dates: string[] = forecastJson?.daily?.time ?? [];
  const highs: number[] = forecastJson?.daily?.temperature_2m_max ?? [];
  const lows: number[] = forecastJson?.daily?.temperature_2m_min ?? [];
  const precip: number[] = forecastJson?.daily?.precipitation_probability_max ?? [];

  const forecast = dates.slice(0, days).map((date, idx) => {
    const high = highs[idx] ?? "–";
    const low = lows[idx] ?? "–";
    const rain = precip[idx] ?? "–";
    return `${resolvedName}: ${date} → High ${high}°C / Low ${low}°C · Rain chance ${rain}%`;
  });

  return { forecast };
};
