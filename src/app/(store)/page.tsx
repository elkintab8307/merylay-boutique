import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-20 text-center">
      <p className="font-script text-2xl text-brand-oro">Bienvenida a</p>
      <h1 className="font-heading text-5xl font-semibold text-brand-ciruela">
        MeryLay Boutique
      </h1>
      <p className="max-w-xl font-body text-lg text-brand-ciruela/80">
        Pijamas y ropa femenina pensadas para ti. Elegancia, comodidad y un
        toque romántico en cada prenda.
      </p>
      <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
        Explorar catálogo
      </Button>

      <div className="mt-16 grid w-full gap-6 sm:grid-cols-3">
        <Card className="border-brand-rosa-claro bg-white/60">
          <CardHeader>
            <CardTitle className="font-heading text-brand-ciruela">
              Diseño elegante
            </CardTitle>
          </CardHeader>
          <CardContent className="text-brand-ciruela/70">
            Prendas pensadas con detalles dorados y siluetas femeninas.
          </CardContent>
        </Card>
        <Card className="border-brand-rosa-claro bg-white/60">
          <CardHeader>
            <CardTitle className="font-heading text-brand-ciruela">
              Comodidad real
            </CardTitle>
          </CardHeader>
          <CardContent className="text-brand-ciruela/70">
            Telas suaves seleccionadas para el día a día.
          </CardContent>
        </Card>
        <Card className="border-brand-rosa-claro bg-white/60">
          <CardHeader>
            <CardTitle className="font-heading text-brand-ciruela">
              Inspiración femenina
            </CardTitle>
          </CardHeader>
          <CardContent className="text-brand-ciruela/70">
            Cada colección refleja delicadeza y autenticidad.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
