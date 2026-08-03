import {
  detectarPeriodo,
  parsearPagina,
  parsearDocumento,
} from '../parser-indice-mensual';
import {
  construirPagina,
  FUENTE_CUERPO,
} from './apoyo/constructores-fixtures';

const CAMPOS_PROHIBIDOS = [
  'fuente',
  'anio',
  'camposInferidos',
  'camposAmbiguos',
  'posibleDuplicado',
  'candidatosDuplicados',
  'huellaDeteccion',
  'RECHAZADO',
  'razonRechazo',
];

describe('parser-indice-mensual', () => {
  describe('detectarPeriodo', () => {
    it('1. detecta mayo 2026 a partir de las fechas de publicación del contenido (no de metadata de creación del PDF)', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Entrada A. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto: '- Entrada B. Res. X-2. SRO 101 martes 5 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      expect(detectarPeriodo([pagina])).toEqual({ anio: 2026, mes: 5 });
    });

    it('2. retorna el año/mes mayoritario del contenido cuando hay una fecha minoritaria distinta', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Entrada A. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto: '- Entrada B. Res. X-2. SRO 101 martes 5 de mayo de 2026.',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto:
            '- Entrada C, que cita un acto previo de 20 de abril de 2019. Res. X-3. EE 300 jueves 7 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      expect(detectarPeriodo([pagina])).toEqual({ anio: 2026, mes: 5 });
    });

    it('sin ninguna fecha detectable en el contenido, retorna null', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: 'AGENCIA SIN ENTRADAS DETECTABLES',
          fuente: 'institucion',
        },
      ]);

      expect(detectarPeriodo([pagina])).toBeNull();
    });
  });

  describe('parsearPagina — columnas y orden de lectura', () => {
    it('3. respeta una página de una sola columna, en orden de arriba hacia abajo', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Entrada A. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto: '- Entrada B. Res. X-2. SRO 101 martes 5 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entradas = parsearPagina(pagina).entradas;
      expect(entradas).toHaveLength(2);
      expect(entradas[0].publicacion?.numero).toBe(100);
      expect(entradas[1].publicacion?.numero).toBe(101);
    });

    it('4. detecta dos columnas y nunca mezcla filas entre columnas', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'izquierda',
          texto: '- Entrada izquierda 1. Res. IZ-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
        {
          columna: 'izquierda',
          texto: '- Entrada izquierda 2. Res. IZ-2. RO 101 martes 5 de mayo de 2026.',
          nuevoParrafo: true,
        },
        {
          columna: 'derecha',
          texto: '- Entrada derecha 1. Res. DE-1. RO 102 miércoles 6 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entradas = parsearPagina(pagina).entradas;
      expect(entradas.map((e) => e.numero)).toEqual(['IZ-1', 'IZ-2', 'DE-1']);
    });

    it('5. parsearDocumento respeta el orden página → columna izquierda → columna derecha', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'izquierda',
          texto: '- Entrada IZ. Res. IZ-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
        {
          columna: 'derecha',
          texto: '- Entrada DE. Res. DE-1. RO 101 martes 5 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const resultado = parsearDocumento([pagina]);
      expect(resultado.entradas.map((e) => e.numero)).toEqual(['IZ-1', 'DE-1']);
    });
  });

  describe('continuidad entre columnas y páginas', () => {
    it('6. una entrada que termina la columna derecha de una página sin referencia de publicación cierra en la columna izquierda de la página siguiente, sin cortar segmentoCrudo', () => {
      const pagina1 = construirPagina(1, [
        {
          columna: 'derecha',
          texto: '- Se otorga la personería jurídica a la fundación',
          nuevoParrafo: true,
        },
      ]);
      const pagina2 = construirPagina(2, [
        {
          columna: 'izquierda',
          texto: 'Ejemplo, con domicilio en Quito. Res. X-9. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const resultado = parsearDocumento([pagina1, pagina2]);
      expect(resultado.entradas).toHaveLength(1);
      expect(resultado.entradas[0].segmentoCrudo).toContain('personería jurídica');
      expect(resultado.entradas[0].segmentoCrudo).toContain('Ejemplo, con domicilio en Quito');
      expect(resultado.entradas[0].publicacion?.numero).toBe(100);
    });
  });

  describe('falsos inicios con guion — no deben partir la entrada', () => {
    const casosFalsoGuion = [
      '2023 - 2027',
      'EPA EP',
      'EPOCA',
      'Exportación',
    ];

    it.each(casosFalsoGuion)(
      '7-10. no divide la entrada en una línea intermedia "%s" (salto de interlineado normal, no de párrafo)',
      (fragmentoAmbiguo) => {
        const pagina = construirPagina(1, [
          {
            columna: 'unica',
            texto: '- Se declara vigente el período institucional',
            nuevoParrafo: true,
          },
          { columna: 'unica', texto: fragmentoAmbiguo },
          {
            columna: 'unica',
            texto: 'y se dispone su publicación. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          },
        ]);

        const entradas = parsearPagina(pagina).entradas;
        expect(entradas).toHaveLength(1);
        expect(entradas[0].segmentoCrudo).toContain(fragmentoAmbiguo);
        expect(entradas[0].publicacion?.numero).toBe(100);
      },
    );
  });

  describe('entradas sin viñeta', () => {
    it('11. detecta una entrada real sin viñeta inicial y agrega ENTRADA_SIN_VINETA', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'izquierda',
          texto: 'Fundación "Reci-cletas Ecuador", con domicilio en Quito.',
          nuevoParrafo: true,
        },
        {
          columna: 'izquierda',
          texto: 'Res. X-1. 2SRO 281 lunes 11 de mayo de 2026.',
        },
      ]);

      const entradas = parsearPagina(pagina).entradas;
      expect(entradas).toHaveLength(1);
      expect(entradas[0].advertencias).toContain('ENTRADA_SIN_VINETA');
      expect(entradas[0].segmentoCrudo.startsWith('-')).toBe(false);
    });
  });

  describe('normalización de referencias de publicación', () => {
    it('12. normaliza puntuación irregular "2SRO. 282 martes 12 de mayo de 2026"', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Entrada. Res. X-1. 2SRO. 282 martes 12 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const publicacion = parsearPagina(pagina).entradas[0].publicacion;
      expect(publicacion).toEqual({ tipo: '2SRO', numero: 282, fecha: '2026-05-12' });
    });

    it('13. acepta una fecha sin día de la semana "EE 1345 8 de mayo de 2026"', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Entrada. Res. X-1. EE 1345 8 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const publicacion = parsearPagina(pagina).entradas[0].publicacion;
      expect(publicacion).toEqual({ tipo: 'EE', numero: 1345, fecha: '2026-05-08' });
    });

    it('14. detecta una contradicción entre día de la semana y fecha calendario sin alterar la fecha', () => {
      // El 4 de mayo de 2026 es lunes; "jueves" es una contradicción deliberada.
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Entrada. Res. X-1. RO 100 jueves 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.publicacion?.fecha).toBe('2026-05-04');
      expect(entrada.advertencias).toContain('DIA_SEMANA_INCONSISTENTE');
    });

    it('rechaza una fecha calendario imposible sin descartar la entrada completa', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Entrada. Res. X-1. RO 100 lunes 31 de febrero de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.publicacion).toEqual({
        tipo: 'RO',
        numero: 100,
        fecha: null,
      });
      expect(entrada.advertencias).toContain(
        'FECHA_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADA',
      );
      expect(entrada.advertencias).not.toContain('DIA_SEMANA_INCONSISTENTE');
      expect(entrada.segmentoCrudo).toContain('31 de febrero de 2026');
    });

    it('acepta una fecha bisiesta real mediante validación calendario estricta', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Entrada. Res. X-1. RO 100 29 de febrero de 2028.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.publicacion?.fecha).toBe('2028-02-29');
      expect(entrada.advertencias).not.toContain(
        'FECHA_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADA',
      );
    });

    it('15. preserva un tipo inválido como null: "E 1389 jueves 21 de mayo de 2026"', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Entrada. Res. X-1. E 1389 jueves 21 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.publicacion).toEqual({
        tipo: null,
        numero: 1389,
        fecha: '2026-05-21',
      });
      expect(entrada.segmentoCrudo).toContain('E 1389 jueves 21 de mayo de 2026');
      expect(entrada.advertencias).toContain(
        'TIPO_PUBLICACION_REGISTRO_OFICIAL_NO_DETECTADO',
      );
    });
  });

  describe('múltiples publicaciones', () => {
    it('16. detecta múltiples publicaciones sin duplicar la Norma: principal = primera cronológica, resto en metadataExtraccion', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Entrada con dos publicaciones. Res. X-1. EE 1338 miércoles 6 de mayo de 2026. Fe de erratas: EE 1345 viernes 8 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entradas = parsearPagina(pagina).entradas;
      expect(entradas).toHaveLength(1);
      const entrada = entradas[0];
      expect(entrada.publicacion).toEqual({ tipo: 'EE', numero: 1338, fecha: '2026-05-06' });
      expect(entrada.metadataExtraccion.publicacionesAdicionales).toEqual([
        { tipo: 'EE', numero: 1345, fecha: '2026-05-08' },
      ]);
      expect(entrada.advertencias).toContain('MULTIPLES_PUBLICACIONES_DETECTADAS');
    });
  });

  describe('institución y sección', () => {
    it('21. usa el encabezado en curso como institución por defecto', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: 'AGENCIA DE EJEMPLO:',
          fuente: 'institucion',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto: '- Se delega una atribución. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.institucion).toBe('AGENCIA DE EJEMPLO');
      expect(entrada.seccion).toBeNull();
    });

    it('22. en agrupaciones tipo "ORDENANZAS MUNICIPALES" usa el encabezado como sección y el prefijo propio de la entrada como institución', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: 'ORDENANZAS MUNICIPALES:',
          fuente: 'institucion',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto:
            '- Cantón Ejemplo: Que reforma la ordenanza de tránsito. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.seccion).toBe('ORDENANZAS MUNICIPALES');
      expect(entrada.institucion).toBe('Cantón Ejemplo');
    });
  });

  describe('sin invención de campos', () => {
    it('17. no inventa título/tipo/numero/institución cuando no hay evidencia textual explícita', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Se dispone una medida sin identificador explícito. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.tipo).toBeNull();
      expect(entrada.numero).toBeNull();
      expect(entrada.titulo).toBeNull();
      expect(entrada.institucion).toBeNull();
    });

    it('18. ningún campo prohibido aparece en la salida del parser', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Entrada. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      for (const campoProhibido of CAMPOS_PROHIBIDOS) {
        expect(entrada).not.toHaveProperty(campoProhibido);
        expect(entrada.metadataExtraccion).not.toHaveProperty(campoProhibido);
      }
    });
  });

  describe('posiciones globales y determinismo', () => {
    it('19. asigna posiciones globales consecutivas 0..N-1 en orden de lectura visual sobre varias páginas', () => {
      const pagina1 = construirPagina(1, [
        {
          columna: 'izquierda',
          texto: '- A. Res. A-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
        {
          columna: 'derecha',
          texto: '- B. Res. B-1. RO 101 martes 5 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const pagina2 = construirPagina(2, [
        {
          columna: 'izquierda',
          texto: '- C. Res. C-1. RO 102 miércoles 6 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const resultado = parsearDocumento([pagina1, pagina2]);
      expect(resultado.entradas.map((e) => e.numero)).toEqual(['A-1', 'B-1', 'C-1']);
    });

    it('20. produce una salida determinista: dos ejecuciones sobre el mismo input dan el mismo JSON', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'izquierda',
          texto: '- A. Res. A-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
        {
          columna: 'derecha',
          texto:
            '- B con dos publicaciones. Res. B-1. EE 1338 miércoles 6 de mayo de 2026. EE 1345 viernes 8 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const primera = JSON.stringify(parsearDocumento([pagina]));
      const segunda = JSON.stringify(parsearDocumento([pagina]));
      expect(primera).toBe(segunda);
    });
  });

  describe('A1 — marcador jurídico más cercano a la referencia, no el primero del texto', () => {
    it('1. "Ley ... Sent. 78-21-IN/26" reconoce Sentencia, no Ley', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Se declara la constitucionalidad de la Ley Orgánica para la Erradicación del Trabajo Infantil. Sent. 78-21-IN/26. EC 238 viernes 15 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.tipo).toBe('Sentencia');
      expect(entrada.numero).toBe('78-21-IN/26');
      expect(entrada.titulo).toBe(
        'Se declara la constitucionalidad de la Ley Orgánica para la Erradicación del Trabajo Infantil.',
      );
    });

    it('2. "Ley ... Auto. Caso 1-26-OP" reconoce Auto, no Ley, y proyecta únicamente el identificador canónico', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Se resuelve la consulta de constitucionalidad de la Ley de Ordenamiento Territorial. Auto. Caso 1-26-OP. EC 246 jueves 28 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.tipo).toBe('Auto');
      expect(entrada.numero).toBe('1-26-OP');
    });

    it('3. "Ley ... Dcto. 379" reconoce Decreto, no Ley', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Se reforma el Reglamento de la Ley Orgánica de Régimen Tributario Interno. Dcto. 379. 4SRO 282 martes 12 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.tipo).toBe('Decreto');
      expect(entrada.numero).toBe('379');
    });

    it('4. "Ley ... Res. BCE-GG-011-2026" reconoce Resolución, no Ley (posiciones 18/137)', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Se aprueba la reforma al estatuto conforme a la Ley de Compañías. Res. BCE-GG-011-2026. RO 280 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.tipo).toBe('Resolución');
      expect(entrada.numero).toBe('BCE-GG-011-2026');
    });

    it('5. una Ley real sin marcador posterior produce tipo Ley, numero null y título completo', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Ley Orgánica para el Fortalecimiento de la Ciberseguridad. 5SRO 290 viernes 22 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.tipo).toBe('Ley');
      expect(entrada.numero).toBeNull();
      expect(entrada.titulo).toBe(
        'Ley Orgánica para el Fortalecimiento de la Ciberseguridad.',
      );
    });

    it('no inventa numero cuando el marcador no tiene identificador antes de la referencia', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Res. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.tipo).toBeNull();
      expect(entrada.numero).toBeNull();
    });

    it('una mención narrativa de "Ley" en medio de una descripción, sin marcador propio, no clasifica la entrada como Ley', () => {
      // Caso real: una ordenanza sin marcador propio ("Ord.") que, al
      // describir su alcance, cita el nombre de otra ley ya existente. La
      // mención de "Ley" está lejos del inicio del texto, describiendo qué
      // norma ampara a los afectados, no anunciando que esta entrada ES esa
      // ley. Sin un marcador propio cercano al inicio, no hay evidencia
      // suficiente: tipo y numero deben quedar null, nunca "Ley".
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Cantón Ejemplo: Que reforma el procedimiento de liquidación para servidores amparados por la Ley Orgánica del Servicio Público. EE 1400 martes 26 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.tipo).toBeNull();
      expect(entrada.numero).toBeNull();
    });
  });

  describe('A2 — normalización de espacios de maquetación en identificadores', () => {
    it.each([
      [
        '- Se acepta la acción. Sent. 78- 21-IN/26. EC 238 viernes 15 de mayo de 2026.',
        '78-21-IN/26',
      ],
      [
        '- Se emiten directrices. Res. UAFE- DG-2026-0007. RO 291 martes 26 de mayo de 2026.',
        'UAFE-DG-2026-0007',
      ],
      [
        '- Se autoriza la fusión. Res. MD-DZ8-2025- 0125-R. RO 280 lunes 4 de mayo de 2026.',
        'MD-DZ8-2025-0125-R',
      ],
      [
        '- Se designa delegado. Res. MINEDEC- VD-2026-0108-R. RO 280 lunes 4 de mayo de 2026.',
        'MINEDEC-VD-2026-0108-R',
      ],
    ])('normaliza espacios de maquetación alrededor de "-" y "/": %s', (texto, numeroEsperado) => {
      const pagina = construirPagina(1, [
        { columna: 'unica', texto, nuevoParrafo: true },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.numero).toBe(numeroEsperado);
    });

    it('elimina la etiqueta "Caso" del identificador canónico de un Auto', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Se resuelve la consulta. Auto. Caso 1-26-OP. EC 246 jueves 28 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.numero).toBe('1-26-OP');
      expect(entrada.segmentoCrudo).toContain('Auto. Caso 1-26-OP');
    });

    it('conserva espacios internos que sí forman parte del identificador detectado', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Se aprueba la alineación. Res. 001-2026 PDOT-GPSRS. EE 1345 viernes 8 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.numero).toBe('001-2026 PDOT-GPSRS');
    });

    it('elimina la etiqueta descriptiva "de causa." y conserva solo el identificador', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Acción Pública de Inconstitucionalidad. Res. de causa. 186-25-IN. EC 234 jueves 7 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.numero).toBe('186-25-IN');
      expect(entrada.segmentoCrudo).toContain('Res. de causa. 186-25-IN');
    });

    it('deduplica un identificador repetido exactamente en la fuente', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Se asigna el modelo de gestión. Res. 001-CNC-2026. 001-CNC-2026. RO 276 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.numero).toBe('001-CNC-2026');
      expect(entrada.segmentoCrudo).toContain(
        'Res. 001-CNC-2026. 001-CNC-2026',
      );
    });

    it('si no puede aislar un identificador, deja numero null y agrega una advertencia', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto:
            '- Se dispone una medida. Res. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.numero).toBeNull();
      expect(entrada.advertencias).toContain('NUMERO_NORMA_NO_DETECTADO');
    });

    it('segmentoCrudo conserva la representación textual original, sin normalizar', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Se emiten directrices. Res. UAFE- DG-2026-0007. RO 291 martes 26 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.numero).toBe('UAFE-DG-2026-0007');
      expect(entrada.segmentoCrudo).toContain('UAFE- DG-2026-0007');
    });
  });

  describe('A3 — institución y sección basadas en evidencia visual', () => {
    it('8. un encabezado en mayúsculas sostenidas es institución válida', () => {
      const pagina = construirPagina(1, [
        { columna: 'unica', texto: 'AGENCIA REAL DE EJEMPLO:', nuevoParrafo: true },
        {
          columna: 'unica',
          texto: '- Se delega una atribución. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.institucion).toBe('AGENCIA REAL DE EJEMPLO');
    });

    it('9. un párrafo descriptivo en minúsculas no reemplaza la institución vigente', () => {
      const pagina = construirPagina(1, [
        { columna: 'unica', texto: 'AGENCIA REAL:', nuevoParrafo: true },
        {
          columna: 'unica',
          texto:
            'Se aprueba la modificación a la planificación de las siguientes organizaciones:',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto: '- Organización X. Res. Y-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.institucion).toBe('AGENCIA REAL');
    });

    it('10. "Se expide ...:" no se convierte en institución', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: 'Se expide el acto normativo denominado:',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto: '- Norma técnica de ejemplo. Res. Z-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.institucion).toBeNull();
      expect(entrada.advertencias).toContain('INSTITUCION_NO_DETECTADA');
    });

    it('11. un prefijo geográfico/institucional acotado (Cantón) sí se reconoce como institución', () => {
      const pagina = construirPagina(1, [
        { columna: 'unica', texto: 'ORDENANZAS MUNICIPALES:', nuevoParrafo: true },
        {
          columna: 'unica',
          texto:
            '- Cantón Ejemplo: Que reforma la ordenanza de tránsito. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.institucion).toBe('Cantón Ejemplo');
      expect(entrada.seccion).toBe('ORDENANZAS MUNICIPALES');
    });

    it('fuera de una sección, un prefijo ajeno a la lista acotada no se interpreta como institución', () => {
      const pagina = construirPagina(1, [
        { columna: 'unica', texto: 'AGENCIA REAL:', nuevoParrafo: true },
        {
          columna: 'unica',
          texto:
            '- Fundación Ejemplo: Que reforma su estatuto. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.institucion).toBe('AGENCIA REAL');
    });

    it('dentro de una sección, el contexto permite una institución explícita genérica y un párrafo narrativo separado no la reemplaza', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: 'RESOLUCIONES MUNICIPALES:',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto: 'Se agrupan a continuación las instituciones participantes:',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto:
            '- Cuerpo de Bomberos de Cayambe: Se aprueba una medida. Res. CBC-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.seccion).toBe('RESOLUCIONES MUNICIPALES');
      expect(entrada.institucion).toBe('Cuerpo de Bomberos de Cayambe');
      expect(entrada.institucion).not.toContain('Se agrupan');
    });

    it('12. sin ningún encabezado verificable, institución es null con advertencia', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: '- Se dispone una medida. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);
      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.institucion).toBeNull();
      expect(entrada.advertencias).toContain('INSTITUCION_NO_DETECTADA');
    });

    it('13. un fragmento decorativo aislado (banner) nunca contamina el encabezado institucional real', () => {
      // Reproduce la estructura del banner vertical de portada: una columna
      // angosta con palabras sueltas en mayúsculas, separadas por saltos muy
      // grandes, junto a una columna de cuerpo con el encabezado real. El
      // fragmento decorativo no debe convertirse en fragmentoAbierto ni
      // concatenarse con el encabezado real: al ser mayúsculas sostenidas,
      // cada fragmento sobrescribe en su turno y el encabezado real gana al
      // procesarse después.
      const anchoPagina = 600;
      const altoPagina = 800;
      const pagina = {
        numeroPagina: 1,
        anchoPagina,
        altoPagina,
        palabras: [
          { texto: 'DECORATIVO1', x: 20, yDesdeArriba: 100, ancho: 60, alto: 11, fuente: 'banner' },
          { texto: 'DECORATIVO2', x: 20, yDesdeArriba: 300, ancho: 60, alto: 11, fuente: 'banner' },
          { texto: 'AGENCIA', x: 300, yDesdeArriba: 100, ancho: 50, alto: 11, fuente: 'cuerpo' },
          { texto: 'REAL:', x: 355, yDesdeArriba: 100, ancho: 40, alto: 11, fuente: 'cuerpo' },
          {
            texto: '- Se delega una atribución. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
            x: 300,
            yDesdeArriba: 130,
            ancho: 250,
            alto: 11,
            fuente: 'cuerpo',
          },
        ],
      };

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.institucion).toBe('AGENCIA REAL');
      expect(entrada.institucion).not.toContain('DECORATIVO');
    });

    it('un encabezado estructural se conserva como sección y no como institución', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: 'AVISOS JUDICIALES:',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto:
            '- Juicio por muerte presunta. RO 281 lunes 11 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.seccion).toBe('AVISOS JUDICIALES');
      expect(entrada.institucion).toBeNull();
      expect(entrada.advertencias).toContain('INSTITUCION_NO_DETECTADA');
    });

    it('separa ORDENANZAS METROPOLITANAS de la institución explícita de la entrada', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: 'ORDENANZAS METROPOLITANAS:',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto:
            '- Concejo del Distrito Metropolitano de Quito: Para la designación vial. Ord. 020-2026-DEP. EE 1346 viernes 8 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.seccion).toBe('ORDENANZAS METROPOLITANAS');
      expect(entrada.institucion).toBe(
        'Concejo del Distrito Metropolitano de Quito',
      );
      expect(entrada.titulo).toBe('Para la designación vial.');
    });

    it('separa ORDENANZAS PROVINCIALES de un Gobierno Provincial explícito', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: 'ORDENANZAS PROVINCIALES:',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto:
            '- Gobierno Provincial del Azuay: De promoción y protección de derechos. Ord. 151. EE 1338 miércoles 6 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.seccion).toBe('ORDENANZAS PROVINCIALES');
      expect(entrada.institucion).toBe('Gobierno Provincial del Azuay');
    });

    it('un prefijo institucional que llega ya pegado en un único fragmento (sin evidencia geométrica recuperable) no se adivina: institución null y advertida', () => {
      // `construirPagina` entrega el texto de la entrada ya como una sola
      // cadena por línea (no como fragmentos de PDF.js con sus propias
      // coordenadas): no hay ningún hueco entre palabras que reconstruir,
      // exactamente el caso "un único TextItem pegado sin evidencia
      // geométrica" del principio central de esta estabilización. Antes
      // este caso se corregía con una sustitución de frase hardcodeada
      // para "Gobierno Autónomo Descentralizado"; ese parche se retiró
      // (ver M2) porque no distinguía este caso de cualquier otro nombre
      // institucional pegado sin evidencia — el comportamiento correcto es
      // no inventar el espacio.
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: 'RESOLUCIONES PARROQUIALES RURALES:',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto:
            '-GobiernoAutónomoDescentralizadoParroquial Rural de El Valle: Se aprueba la alineación. Res. 001-JP-VALLE-2026. EE 1343 jueves 7 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.seccion).toBe('RESOLUCIONES PARROQUIALES RURALES');
      expect(entrada.institucion).toBeNull();
      expect(entrada.advertencias).toContain('INSTITUCION_NO_DETECTADA');
    });

    it('un encabezado institucional posterior cierra la sección estructural anterior', () => {
      const pagina = construirPagina(1, [
        {
          columna: 'unica',
          texto: 'AVISOS JUDICIALES:',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto: 'AGENCIA DE EJEMPLO:',
          nuevoParrafo: true,
        },
        {
          columna: 'unica',
          texto:
            '- Se delega una atribución. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
          nuevoParrafo: true,
        },
      ]);

      const entrada = parsearPagina(pagina).entradas[0];
      expect(entrada.institucion).toBe('AGENCIA DE EJEMPLO');
      expect(entrada.seccion).toBeNull();
    });
  });

  describe('estabilización textual — reconstrucción basada en evidencia geométrica de PDF.js', () => {
    const ALTO_REF = 11;
    // Interlineado normal entre líneas del mismo párrafo (evidencia real del
    // fixture piloto: ~11-11.2pt de alto de línea con ~10% de interlineado
    // adicional). Un salto de párrafo real es sustancialmente mayor (ver
    // `calcularUmbralParrafo` en producción): se usa un múltiplo claramente
    // por encima de `FACTOR_CRECIMIENTO_INTERLINEADO` para que la evidencia
    // geométrica del propio fixture (no un valor arbitrario elegido para que
    // el test pase) distinga ambos saltos.
    const SALTO_LINEA_REF = ALTO_REF * 1.1;
    const SALTO_PARRAFO_REF = ALTO_REF * 2.5;
    // Huecos de referencia calibrados contra la distribución empírica real
    // medida en el PDF piloto (6084 huecos entre TextItem consecutivos):
    // el cúmulo de "sin separación" no supera 0.134pt y el cúmulo de
    // "espacio real" empieza en 0.262pt. Se usan valores claramente dentro
    // de cada cúmulo, nunca justo en el límite, para que el test no dependa
    // de la ubicación exacta del umbral productivo.
    const HUECO_SIN_SEPARACION = 0.08;
    const HUECO_ESPACIO_REAL_PEQUENO = 0.4;
    const HUECO_ESPACIO_REAL_NORMAL = 5;

    interface FragmentoLinea {
      texto: string;
      /** Hueco horizontal, en pt, respecto al final del fragmento anterior
       * de la misma línea. Ignorado en el primer fragmento de cada línea.
       * Por defecto, un hueco de palabra realista muy por encima de
       * cualquier umbral posible, para que solo los tests que
       * deliberadamente controlan un hueco pequeño lo especifiquen. */
      gap?: number;
    }

    /** Construye una PaginaLeida con control total sobre la geometría de
     * cada TextItem (posición, ancho, alto), agrupada en párrafos y líneas
     * explícitos — necesario para probar la reconstrucción por huecos
     * reales y continuidad visual, que `construirPagina` no modela (esa
     * ayuda entrega una sola palabra ya completa por línea, sin fragmentos
     * ni huecos propios). `grupos` es una lista de párrafos; cada párrafo,
     * una lista de líneas; cada línea, una lista de fragmentos. El salto
     * vertical entre líneas de un mismo párrafo es el interlineado normal;
     * entre párrafos, un salto de párrafo claro — reproduciendo la misma
     * evidencia geométrica (no una etiqueta artificial) que en el
     * documento real distingue una continuación de un párrafo nuevo. */
    function paginaCruda(
      grupos: FragmentoLinea[][][],
      opciones: { xInicial?: number } = {},
    ) {
      const xInicial = opciones.xInicial ?? 65;
      const palabras: Array<{
        texto: string;
        x: number;
        yDesdeArriba: number;
        ancho: number;
        alto: number;
        fuente: string;
      }> = [];
      let y = 100;
      grupos.forEach((parrafo, indiceParrafo) => {
        if (indiceParrafo > 0) y += SALTO_PARRAFO_REF;
        parrafo.forEach((linea, indiceLinea) => {
          if (indiceLinea > 0) y += SALTO_LINEA_REF;
          let cursorX = xInicial;
          linea.forEach((fragmento, indiceFragmento) => {
            const gap =
              indiceFragmento === 0
                ? 0
                : fragmento.gap ?? HUECO_ESPACIO_REAL_NORMAL;
            const x = cursorX + gap;
            const ancho = fragmento.texto.length * 6;
            palabras.push({
              texto: fragmento.texto,
              x,
              yDesdeArriba: y,
              ancho,
              alto: ALTO_REF,
              fuente: 'cuerpo',
            });
            cursorX = x + ancho;
          });
        });
      });
      return {
        numeroPagina: 1,
        anchoPagina: 600,
        altoPagina: 800,
        palabras,
      };
    }

    /** Línea de cierre de entrada estándar, reutilizada por los fixtures
     * que no están probando el propio texto de la entrada: viñeta, marcador
     * jurídico y referencia de publicación válida. */
    function lineaEntradaEstandar(): FragmentoLinea[] {
      return [
        { texto: '-' },
        { texto: 'Se' },
        { texto: 'delega.' },
        { texto: 'Res.' },
        { texto: 'X-1.' },
        { texto: 'RO' },
        { texto: '100' },
        { texto: 'lunes' },
        { texto: '4' },
        { texto: 'de' },
        { texto: 'mayo' },
        { texto: 'de' },
        { texto: '2026.' },
      ];
    }

    describe('M1 — guiones de fin de línea en encabezados, reconstruidos solo con continuidad visual', () => {
      it('1. guion de división de palabra entre dos líneas del mismo párrafo (misma columna, interlineado normal) → une sin guion', () => {
        // "CONSEJO NACIO-" termina la línea; "NAL DE PRUEBA:" retoma en la
        // línea siguiente del MISMO párrafo (interlineado normal, no salto
        // de párrafo) — evidencia de que es una sola palabra partida por el
        // ancho de columna, no dos palabras distintas.
        const pagina = paginaCruda([
          [
            [{ texto: 'CONSEJO' }, { texto: 'NACIO-' }],
            [{ texto: 'NAL' }, { texto: 'DE' }, { texto: 'PRUEBA:' }],
          ],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.institucion).toBe('CONSEJO NACIONAL DE PRUEBA');
      });

      it('2. caso sintético nuevo, sin relación con ninguna institución del fixture real, se reconstruye igual (regla general, no memorización)', () => {
        const pagina = paginaCruda([
          [
            [{ texto: 'AGENCIA' }, { texto: 'DE' }, { texto: 'VERIFICA-' }],
            [{ texto: 'CIÓN' }, { texto: 'GENÉRICA:' }],
          ],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.institucion).toBe('AGENCIA DE VERIFICACIÓN GENÉRICA');
      });

      it('3. guion semántico dentro de la misma línea (con espacios a ambos lados) se conserva', () => {
        const pagina = paginaCruda([
          [
            [
              { texto: 'AGENCIA' },
              { texto: 'REGIONAL' },
              { texto: '-' },
              { texto: 'ZONA' },
              { texto: 'NORTE:' },
            ],
          ],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.institucion).toBe('AGENCIA REGIONAL - ZONA NORTE');
      });

      it('4. guion de fin de línea sin continuidad visual real (la línea siguiente es un párrafo distinto, no una continuación) se conserva sin unir', () => {
        const pagina = paginaCruda([
          [[{ texto: 'AGENCIA-' }]],
          [[{ texto: 'OTRA' }, { texto: 'ENTIDAD:' }]],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        // "AGENCIA-" es su propio párrafo/encabezado (no hay línea
        // siguiente EN EL MISMO PÁRRAFO con la que unirse); "OTRA
        // ENTIDAD:" es un encabezado independiente posterior y es el que
        // rige cuando ocurre la entrada.
        expect(entrada.institucion).toBe('OTRA ENTIDAD');
      });

      it('5. segmentoCrudo conserva el guion y el espacio originales de la entrada, sin la reconstrucción de encabezados', () => {
        const pagina = paginaCruda([
          [
            [{ texto: 'CONSEJO' }, { texto: 'NACIO-' }],
            [{ texto: 'NAL' }, { texto: 'DE' }, { texto: 'PRUEBA:' }],
          ],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.institucion).toBe('CONSEJO NACIONAL DE PRUEBA');
        expect(entrada.segmentoCrudo).toContain(
          '- Se delega. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
        );
      });

      it('6. un identificador con guion de fin de línea DENTRO del cuerpo de una entrada (no en un encabezado) no se ve afectado: numero conserva su propio tratamiento existente', () => {
        // La reconstrucción de encabezados de M1 nunca se aplica al cuerpo
        // de una entrada (con viñeta, minúsculas): un identificador como
        // "AGEN-CIA-2026-001" partido por salto de línea sigue gobernado
        // únicamente por la normalización de espacios ya existente para
        // `numero` (une el hueco de maquetación alrededor del guion, sin
        // eliminarlo).
        const pagina = paginaCruda([
          [[{ texto: 'AGENCIA' }, { texto: 'REAL:' }]],
          [
            [
              { texto: '-' },
              { texto: 'Se' },
              { texto: 'delega.' },
              { texto: 'Res.' },
              { texto: 'AGEN-' },
            ],
            [
              { texto: 'CIA-2026-001.' },
              { texto: 'RO' },
              { texto: '100' },
              { texto: 'lunes' },
              { texto: '4' },
              { texto: 'de' },
              { texto: 'mayo' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
          ],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.institucion).toBe('AGENCIA REAL');
        expect(entrada.numero).toBe('AGEN-CIA-2026-001');
      });
    });

    describe('M2 — palabras pegadas en instituciones, reconstruidas solo con evidencia de huecos reales', () => {
      it('1. dos TextItem con separación visual pequeña pero real (por debajo del antiguo umbral fijo de 1pt) agregan espacio', () => {
        // Hueco de 0.4pt entre fragmentos: menor al umbral anterior fijo de
        // 1pt (que los habría fusionado), pero geométricamente real y
        // consistente con la evidencia empírica del fixture real (huecos de
        // palabra genuinos observados desde 0.262pt).
        const pagina = paginaCruda([
          [
            [
              { texto: 'INSTITUTO' },
              { texto: 'GENÉRICO', gap: HUECO_ESPACIO_REAL_PEQUENO },
              { texto: 'DE', gap: HUECO_ESPACIO_REAL_PEQUENO },
              { texto: 'PRUEBA:', gap: HUECO_ESPACIO_REAL_PEQUENO },
            ],
          ],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.institucion).toBe('INSTITUTO GENÉRICO DE PRUEBA');
      });

      it('2. dos fragmentos sin separación visual real (hueco casi cero) se concatenan sin espacio, mientras que los huecos reales del resto del encabezado sí producen espacio', () => {
        // Hueco de 0.08pt entre "INSTITUTO" y "NACIONAL": dentro del cúmulo
        // empírico de "sin separación" (tope observado 0.134pt), frente al
        // resto del encabezado que usa el hueco de palabra por defecto.
        const pagina = paginaCruda([
          [
            [
              { texto: 'INSTITUTO' },
              { texto: 'NACIONAL', gap: HUECO_SIN_SEPARACION },
              { texto: 'DE' },
              { texto: 'PRUEBAS:' },
            ],
          ],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.institucion).toBe('INSTITUTONACIONAL DE PRUEBAS');
      });

      it('3-4. un único TextItem pegado sin evidencia geométrica no se corrige por diccionario: institución null y advertida', () => {
        const pagina = paginaCruda([
          [[{ texto: 'AgenciaGenéricaDePrueba' }, { texto: 'NACIONAL:' }]],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.institucion).toBeNull();
        expect(entrada.advertencias).toContain('INSTITUCION_NO_DETECTADA');
      });

      it('5. una institución ya correcta (huecos reales y suficientes) no se altera', () => {
        const pagina = paginaCruda([
          [[{ texto: 'AGENCIA' }, { texto: 'REAL' }, { texto: 'DE' }, { texto: 'EJEMPLO:' }]],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.institucion).toBe('AGENCIA REAL DE EJEMPLO');
      });
    });

    describe('M3 — título con palabras pegadas: la misma reconstrucción por huecos reales aplica al cuerpo de la entrada', () => {
      it('1. título reconstruible por huecos pequeños pero reales se recupera (misma causa que la posición 676 real)', () => {
        const pagina = paginaCruda([
          [[{ texto: 'AGENCIA' }, { texto: 'REAL:' }]],
          [
            [
              { texto: '-' },
              { texto: 'Se' },
              { texto: 'expide', gap: HUECO_ESPACIO_REAL_PEQUENO },
              { texto: 'el', gap: HUECO_ESPACIO_REAL_PEQUENO },
              { texto: 'cálculo.', gap: HUECO_ESPACIO_REAL_PEQUENO },
              { texto: 'Res.' },
              { texto: 'X-1.' },
              { texto: 'RO' },
              { texto: '100' },
              { texto: 'lunes' },
              { texto: '4' },
              { texto: 'de' },
              { texto: 'mayo' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
          ],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.titulo).toBe('Se expide el cálculo.');
      });

      it('2. título no reconstruible (un único TextItem sin ningún hueco interno, igual que la posición 676 real) queda null y advertido, sin inventar texto', () => {
        const pagina = paginaCruda([
          [[{ texto: 'AGENCIA' }, { texto: 'REAL:' }]],
          [
            [
              { texto: '-' },
              {
                texto:
                  'Seexpideelcálculoparaladistribucióndefondospúblicos.',
              },
              { texto: 'Res.' },
              { texto: 'X-1.' },
              { texto: 'RO' },
              { texto: '100' },
              { texto: 'lunes' },
              { texto: '4' },
              { texto: 'de' },
              { texto: 'mayo' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
          ],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.titulo).toBeNull();
        expect(entrada.advertencias).toContain('TITULO_NO_DETECTADO');
      });

      it('3. un título largo pero válido, con huecos normales entre palabras, no se descarta', () => {
        const pagina = paginaCruda([
          [[{ texto: 'AGENCIA' }, { texto: 'REAL:' }]],
          [
            [
              { texto: '-' },
              { texto: 'Se' },
              { texto: 'aprueba' },
              { texto: 'una' },
              { texto: 'medida' },
              { texto: 'administrativa' },
              { texto: 'extensa.' },
              { texto: 'Res.' },
              { texto: 'X-1.' },
              { texto: 'RO' },
              { texto: '100' },
              { texto: 'lunes' },
              { texto: '4' },
              { texto: 'de' },
              { texto: 'mayo' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
          ],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.titulo).toBe(
          'Se aprueba una medida administrativa extensa.',
        );
      });

      it('4. una palabra legítimamente larga, sin ninguna transición de minúscula a mayúscula, no genera un falso positivo', () => {
        const pagina = paginaCruda([
          [[{ texto: 'AGENCIA' }, { texto: 'REAL:' }]],
          [
            [
              { texto: '-' },
              { texto: 'Se' },
              { texto: 'aprueba' },
              { texto: 'una' },
              { texto: 'medida' },
              { texto: 'extraordinariamente' },
              { texto: 'compleja.' },
              { texto: 'Res.' },
              { texto: 'X-1.' },
              { texto: 'RO' },
              { texto: '100' },
              { texto: 'lunes' },
              { texto: '4' },
              { texto: 'de' },
              { texto: 'mayo' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
          ],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.titulo).toBe(
          'Se aprueba una medida extraordinariamente compleja.',
        );
      });

      it('4b. una sigla o unidad con mayúscula interna legítima (p. ej. "kWh") no genera un falso positivo (regresión: descubierto contra el fixture real en "SARS-CoV-2", "PDyOT", "kWh")', () => {
        // La señal de minúscula-seguida-de-mayúscula usada para institución
        // no es segura para título narrativo: siglas mixtas y unidades
        // legítimas la contienen con frecuencia. Título solo se descarta
        // por una racha de letras implausiblemente larga, nunca por esta
        // transición de mayúscula.
        const pagina = paginaCruda([
          [[{ texto: 'AGENCIA' }, { texto: 'REAL:' }]],
          [
            [
              { texto: '-' },
              { texto: 'Se' },
              { texto: 'otorga' },
              { texto: 'una' },
              { texto: 'compensación' },
              { texto: 'de' },
              { texto: '180' },
              { texto: 'kWh.' },
              { texto: 'Res.' },
              { texto: 'X-1.' },
              { texto: 'RO' },
              { texto: '100' },
              { texto: 'lunes' },
              { texto: '4' },
              { texto: 'de' },
              { texto: 'mayo' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
          ],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.titulo).toBe('Se otorga una compensación de 180 kWh.');
      });

      it('5-6. segmentoCrudo permanece intacto y confianza sigue siendo 1 (el segmento SÍ es una entrada real, independientemente de la calidad de titulo/institucion)', () => {
        const pagina = paginaCruda([
          [[{ texto: 'AgenciaGenéricaDePrueba' }, { texto: 'NACIONAL:' }]],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.segmentoCrudo).toContain(
          '- Se delega. Res. X-1. RO 100 lunes 4 de mayo de 2026.',
        );
        expect(entrada.confianza).toBe(1);
      });
    });

    describe('POSIBLE_FUSION_ENTRADAS — la continuidad geométrica no demuestra identidad jurídica única', () => {
      // NOTA: una versión anterior de este archivo afirmaba que compartir la
      // misma fila física (mismo Y, sin salto de párrafo) demuestra que dos
      // cláusulas describen una única ficha jurídica válida. Esa afirmación
      // era incorrecta y queda descartada aquí: la continuidad geométrica
      // (misma fila o mismo párrafo) determina segmentación VISUAL —cuántos
      // párrafos hay—, nunca identidad jurídica —cuántas fichas legales
      // describe ese párrafo—. El PDF real del Registro Oficial puede
      // presentar, dentro de un único párrafo sin ningún salto detectable,
      // dos cláusulas jurídicas genuinamente distintas con identificadores
      // distintos. Cuando el propio texto exhibe evidencia genérica de esa
      // posible fusión (una cláusula de apertura que se repite textualmente
      // dentro del mismo párrafo, asociada a identificadores jurídicos
      // distintos), la política es fail-closed: no se divide la entrada, no
      // se adivina qué identificador pertenece a qué cláusula. Se conserva
      // una sola entrada con `numero`/`titulo` en null, `tipo` si el
      // marcador jurídico final sigue siendo inequívoco, y la advertencia
      // `POSIBLE_FUSION_ENTRADAS` — nunca dividiendo automáticamente el
      // párrafo en dos normas.

      it('1a. cláusula de apertura repetida en la misma fila física, con identificadores distintos y una sola publicación: numero/titulo quedan null y la fusión se advierte', () => {
        const pagina = paginaCruda([
          [[{ texto: 'CORTE' }, { texto: 'CONSTITUCIONAL:' }]],
          [
            [
              { texto: '-' },
              { texto: 'Recurso' },
              { texto: 'Especial' },
              { texto: 'de' },
              { texto: 'Revisión.' },
            ],
            [
              { texto: 'Solicitante:' },
              { texto: 'Persona' },
              { texto: 'Uno.' },
              // Misma fila: cierre de la primera cláusula + inicio de la
              // segunda, sin salto de línea ni de párrafo — igual que en el
              // PDF real. Esta continuidad geométrica es exactamente la
              // evidencia que NO basta por sí sola para tratarlas como una
              // única ficha jurídica.
              { texto: '12-30-XY' },
              { texto: 'Recurso' },
              { texto: 'Especial' },
              { texto: 'de' },
            ],
            [{ texto: 'Revisión.' }, { texto: 'Solicitante:' }],
            [{ texto: 'Persona' }, { texto: 'Dos.' }],
            [
              { texto: 'Res.' },
              { texto: '9-30-XY.' },
              { texto: 'RO' },
              { texto: '100' },
              { texto: 'lunes' },
              { texto: '4' },
              { texto: 'de' },
              { texto: 'mayo' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
          ],
        ]);

        const entradas = parsearPagina(pagina).entradas;
        expect(entradas).toHaveLength(1);
        const entrada = entradas[0];
        expect(entrada.numero).toBeNull();
        expect(entrada.titulo).toBeNull();
        expect(entrada.tipo).toBe('Resolución');
        expect(entrada.advertencias).toContain('POSIBLE_FUSION_ENTRADAS');
        expect(entrada.advertencias).toContain('NUMERO_NORMA_NO_DETECTADO');
        expect(entrada.advertencias).toContain('TITULO_NO_DETECTADO');
        expect(entrada.segmentoCrudo).toContain('12-30-XY');
        expect(entrada.segmentoCrudo).toContain('9-30-XY');
        expect(entrada.segmentoCrudo).toContain('Persona Dos');
      });

      it('1b. mismo resultado si ambas cláusulas quedan repartidas entre líneas distintas del mismo párrafo, no en la misma fila física', () => {
        const pagina = paginaCruda([
          [[{ texto: 'CORTE' }, { texto: 'CONSTITUCIONAL:' }]],
          [
            [
              { texto: '-' },
              { texto: 'Recurso' },
              { texto: 'Especial' },
              { texto: 'de' },
              { texto: 'Revisión.' },
            ],
            [{ texto: 'Solicitante:' }, { texto: 'Persona' }, { texto: 'Uno.' }],
            [{ texto: '12-30-XY' }, { texto: 'Recurso' }, { texto: 'Especial' }],
            [{ texto: 'de' }, { texto: 'Revisión.' }],
            [{ texto: 'Solicitante:' }, { texto: 'Persona' }, { texto: 'Dos.' }],
            [
              { texto: 'Res.' },
              { texto: '9-30-XY.' },
              { texto: 'RO' },
              { texto: '100' },
              { texto: 'lunes' },
              { texto: '4' },
              { texto: 'de' },
              { texto: 'mayo' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
          ],
        ]);

        const entradas = parsearPagina(pagina).entradas;
        expect(entradas).toHaveLength(1);
        expect(entradas[0].numero).toBeNull();
        expect(entradas[0].titulo).toBeNull();
        expect(entradas[0].advertencias).toContain('POSIBLE_FUSION_ENTRADAS');
      });

      it('3. un caso acumulado legítimo (varios identificadores distintos, una sola apertura jurídica que no se repite) no se marca como fusión', () => {
        const pagina = paginaCruda([
          [[{ texto: 'CORTE' }, { texto: 'CONSTITUCIONAL:' }]],
          [
            [
              { texto: '-' },
              { texto: 'En' },
              { texto: 'los' },
              { texto: 'casos' },
              { texto: '12-30-XY,' },
              { texto: '13-30-XY' },
              { texto: 'y' },
              { texto: '14-30-XY' },
              { texto: 'acumulados' },
              { texto: 'se' },
              { texto: 'resuelve' },
              { texto: 'conjuntamente' },
              { texto: 'la' },
              { texto: 'controversia' },
              { texto: 'planteada.' },
            ],
            [
              { texto: 'Res.' },
              { texto: '12-30-XY.' },
              { texto: 'RO' },
              { texto: '100' },
              { texto: 'lunes' },
              { texto: '4' },
              { texto: 'de' },
              { texto: 'mayo' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
          ],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.numero).toBe('12-30-XY');
        expect(entrada.advertencias).not.toContain('POSIBLE_FUSION_ENTRADAS');
      });

      it('4. una norma que reforma/deroga otra y cita su identificador no se marca como fusión', () => {
        const pagina = paginaCruda([
          [[{ texto: 'CORTE' }, { texto: 'CONSTITUCIONAL:' }]],
          [
            [
              { texto: '-' },
              { texto: 'Se' },
              { texto: 'reforma' },
              { texto: 'la' },
              { texto: 'Resolución' },
              { texto: 'Nro.' },
              { texto: '12-30-XY' },
              { texto: 'de' },
              { texto: '10' },
              { texto: 'de' },
              { texto: 'abril' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
            [
              { texto: 'Res.' },
              { texto: '9-30-XY.' },
              { texto: 'RO' },
              { texto: '100' },
              { texto: 'lunes' },
              { texto: '4' },
              { texto: 'de' },
              { texto: 'mayo' },
              { texto: 'de' },
              { texto: '2026.' },
            ],
          ],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.numero).toBe('9-30-XY');
        expect(entrada.advertencias).not.toContain('POSIBLE_FUSION_ENTRADAS');
      });

      it('5. una entrada ordinaria con un solo identificador no cambia', () => {
        const pagina = paginaCruda([
          [[{ texto: 'AGENCIA' }, { texto: 'REAL:' }]],
          [lineaEntradaEstandar()],
        ]);

        const entrada = parsearPagina(pagina).entradas[0];
        expect(entrada.numero).toBe('X-1');
        expect(entrada.advertencias).not.toContain('POSIBLE_FUSION_ENTRADAS');
      });
    });
  });

  it('sanidad del fixture: FUENTE_CUERPO está definida', () => {
    expect(FUENTE_CUERPO).toBe('cuerpo');
  });
});
