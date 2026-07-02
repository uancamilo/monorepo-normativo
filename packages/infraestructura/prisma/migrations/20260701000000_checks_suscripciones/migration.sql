ALTER TABLE "suscripciones"
ADD CONSTRAINT "suscripciones_cantidad_maxima_usuarios_positiva_check"
CHECK ("cantidad_maxima_usuarios" > 0);

ALTER TABLE "suscripciones"
ADD CONSTRAINT "suscripciones_fecha_fin_posterior_fecha_inicio_check"
CHECK ("fecha_fin" > "fecha_inicio");
