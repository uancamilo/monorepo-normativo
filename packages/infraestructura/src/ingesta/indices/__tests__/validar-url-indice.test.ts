import { describe, expect, it } from '@jest/globals';
import {
  esUrlIndicePermitida,
  HOSTNAME_PDF_INDICE_OFICIAL,
} from '../validar-url-indice';

const URL_OFICIAL_VALIDA =
  'https://esacc.corteconstitucional.gob.ec/storage/api/v1/10_DWL_FL/eyJjYXJwZXRhIjoicm8ifQ==';

describe('esUrlIndicePermitida', () => {
  it('acepta la URL oficial válida con token en el path', () => {
    expect(esUrlIndicePermitida(URL_OFICIAL_VALIDA)).toBe(true);
  });

  it('acepta la URL oficial con query string', () => {
    expect(
      esUrlIndicePermitida(
        `https://${HOSTNAME_PDF_INDICE_OFICIAL}/storage/x?token=abc&v=2`,
      ),
    ).toBe(true);
  });

  it('acepta una URL que no termina en .pdf (tokenizada, sin extensión)', () => {
    expect(
      esUrlIndicePermitida(`https://${HOSTNAME_PDF_INDICE_OFICIAL}/documento-sin-extension`),
    ).toBe(true);
  });

  it('acepta :443 explícito (WHATWG lo normaliza al puerto HTTPS por defecto)', () => {
    expect(
      esUrlIndicePermitida(`https://${HOSTNAME_PDF_INDICE_OFICIAL}:443/x`),
    ).toBe(true);
  });

  it('rechaza esquema http', () => {
    expect(
      esUrlIndicePermitida(`http://${HOSTNAME_PDF_INDICE_OFICIAL}/x`),
    ).toBe(false);
  });

  it('rechaza esquema ftp', () => {
    expect(esUrlIndicePermitida(`ftp://${HOSTNAME_PDF_INDICE_OFICIAL}/x`)).toBe(
      false,
    );
  });

  it('rechaza un hostname engañoso con sufijo', () => {
    expect(
      esUrlIndicePermitida(`https://${HOSTNAME_PDF_INDICE_OFICIAL}.evil.com/x`),
    ).toBe(false);
  });

  it('rechaza un hostname engañoso con prefijo', () => {
    expect(
      esUrlIndicePermitida(`https://evil-${HOSTNAME_PDF_INDICE_OFICIAL}/x`),
    ).toBe(false);
  });

  it('rechaza un subdominio del host oficial', () => {
    expect(
      esUrlIndicePermitida(`https://sub.${HOSTNAME_PDF_INDICE_OFICIAL}/x`),
    ).toBe(false);
  });

  it('rechaza una dirección IP', () => {
    expect(esUrlIndicePermitida('https://127.0.0.1/x')).toBe(false);
  });

  it('rechaza localhost (sin excepción en el validador productivo)', () => {
    expect(esUrlIndicePermitida('https://localhost/x')).toBe(false);
    expect(esUrlIndicePermitida('http://localhost/x')).toBe(false);
  });

  it('rechaza userinfo embebido', () => {
    expect(
      esUrlIndicePermitida(
        `https://user:pass@${HOSTNAME_PDF_INDICE_OFICIAL}/x`,
      ),
    ).toBe(false);
  });

  it('rechaza un puerto no estándar explícito', () => {
    expect(
      esUrlIndicePermitida(`https://${HOSTNAME_PDF_INDICE_OFICIAL}:8443/x`),
    ).toBe(false);
  });

  it('rechaza un homógrafo Unicode (normaliza a punycode distinto)', () => {
    // "с" cirílico en vez de "c" latino en "esacc" — homógrafo visual.
    expect(esUrlIndicePermitida('https://esaсc.corteconstitucional.gob.ec/x')).toBe(
      false,
    );
  });

  it('rechaza una URL malformada', () => {
    expect(esUrlIndicePermitida('no-es-una-url')).toBe(false);
  });

  it('rechaza una cadena vacía', () => {
    expect(esUrlIndicePermitida('')).toBe(false);
  });
});
