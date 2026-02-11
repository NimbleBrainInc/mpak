{{/*
Expand the name of the chart.
*/}}
{{- define "mpak.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "mpak.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "mpak.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "mpak.labels" -}}
helm.sh/chart: {{ include "mpak.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: mpak
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end }}

{{/*
Registry labels
*/}}
{{- define "mpak.registry.labels" -}}
{{ include "mpak.labels" . }}
{{ include "mpak.registry.selectorLabels" . }}
{{- end }}

{{/*
Registry selector labels
*/}}
{{- define "mpak.registry.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mpak.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: registry
{{- end }}

{{/*
Web labels
*/}}
{{- define "mpak.web.labels" -}}
{{ include "mpak.labels" . }}
{{ include "mpak.web.selectorLabels" . }}
{{- end }}

{{/*
Web selector labels
*/}}
{{- define "mpak.web.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mpak.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: web
{{- end }}

{{/*
Registry image
*/}}
{{- define "mpak.registry.image" -}}
{{- $tag := default .Chart.AppVersion .Values.registry.image.tag }}
{{- printf "%s:%s" .Values.registry.image.repository $tag }}
{{- end }}

{{/*
Web image
*/}}
{{- define "mpak.web.image" -}}
{{- $tag := default .Chart.AppVersion .Values.web.image.tag }}
{{- printf "%s:%s" .Values.web.image.repository $tag }}
{{- end }}

{{/*
Secret name (existing or chart-managed)
*/}}
{{- define "mpak.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "mpak.fullname" . }}
{{- end }}
{{- end }}

{{/*
Namespace helper
*/}}
{{- define "mpak.namespace" -}}
{{- default .Release.Namespace .Values.global.namespace }}
{{- end }}

{{/*
Image pull secrets
*/}}
{{- define "mpak.imagePullSecrets" -}}
{{- with .Values.global.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}
