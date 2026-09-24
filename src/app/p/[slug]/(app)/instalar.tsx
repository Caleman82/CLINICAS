"use client";

import { useEffect, useState } from "react";

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Sugerencia para instalar la app en el celular (Android: botón; iPhone: instrucciones). */
export function InstalarApp({ nombre }: { nombre: string }) {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [esIos, setEsIos] = useState(false);
  const [instalada, setInstalada] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    // Se lee del navegador al montar: no hay forma de saberlo en el servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalada(!!standalone);
    setEsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const alPedir = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    window.addEventListener("beforeinstallprompt", alPedir);
    return () => window.removeEventListener("beforeinstallprompt", alPedir);
  }, []);

  if (instalada || (!evento && !esIos)) return null;
  return (
    <aside className="flex flex-col gap-3 rounded-[14px] border border-dashed border-borde-campo p-5">
      <span className="font-semibold">Tené la app de {nombre} en tu celular</span>
      {evento ? (
        <button
          type="button"
          onClick={async () => {
            await evento.prompt();
            setEvento(null);
          }}
          className="h-12 self-start rounded-[10px] bg-tinta px-5 font-semibold text-white"
        >
          Instalar la app
        </button>
      ) : (
        <p className="text-[15px] leading-relaxed text-tinta-media">
          En Safari, tocá el botón Compartir y elegí &ldquo;Agregar a pantalla de inicio&rdquo;.
        </p>
      )}
    </aside>
  );
}
