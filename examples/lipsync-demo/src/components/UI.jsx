import { useEffect, useState } from "react";
import { Visualizer } from "./demo-components/Visualizer";

const examples = [
  {
    label: "Visualizer",
    href: "#",
  },
  {
    label: "3D model",
    href: "#model",
  },
];

export const UI = () => {
  const [currentHash, setCurrentHash] = useState(
    window.location.hash.replace("#", "")
  );

  useEffect(() => {
    // When hash in the url changes, update the href state
    const handleHashChange = () => {
      setCurrentHash(window.location.hash.replace("#", ""));
    };
    window.addEventListener("hashchange", handleHashChange);

    // Cleanup the event listener on component unmount
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return (
    <section className="fixed inset-0 z-10 flex flex-col pointer-events-none h-full">
      <div className="bg-black/80 p-4 opacity-0 animate-fade-in-down animation-delay-200 flex items-center gap-16">
        <a
          className="pointer-events-auto select-none"
          href="https://wawasensei.dev"
          target="_blank"
        >
          <img
            src="/images/wawasensei-white.png"
            alt="Wawa Sensei logo"
            className="w-20 h-20 object-contain"
          />
        </a>
        <div className="flex flex-row items-start gap-4 animation-delay-1500 animate-fade-in-down opacity-0">
          {examples.map((example, index) => (
            <a
              key={index}
              href={example.href}
              className={`${
                currentHash === example.href.replace("#", "")
                  ? "text-white/80 border-b-white/80 "
                  : "text-white/60 border-b-white/60 "
              } text-sm font-medium pointer-events-auto select-none py-3 border-b  hover:text-white hover:border-b-white transition-all duration-200 ease-in-out`}
            >
              {example.label}
            </a>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Visualizer />
      </div>
      <div className="top-1/2 fixed left-4 md:left-15 -translate-x-1/2 -rotate-90 flex items-center gap-4 animation-delay-1500 animate-fade-in-down opacity-0">
        <div className="w-20 h-px bg-white/60"></div>
        <a
          href="https://lessons.wawasensei.dev/courses/react-three-fiber/"
          className="text-white/60 text-xs pointer-events-auto select-none"
        >
          Learn Three.js & React Three Fiber
        </a>
      </div>
    </section>
  );
};
