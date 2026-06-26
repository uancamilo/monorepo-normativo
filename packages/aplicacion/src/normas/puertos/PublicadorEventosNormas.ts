export type EventoNormaPublicada = {
  normaId: string;
  fechaPublicacionEnSistema: Date;
  tieneContenidoCompleto: boolean;
};

export interface PublicadorEventosNormas {
  publicarNormaPublicada(evento: EventoNormaPublicada): Promise<void>;
}
