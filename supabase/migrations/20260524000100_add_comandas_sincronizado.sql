ALTER TABLE public.comandas
ADD COLUMN IF NOT EXISTS sincronizado boolean DEFAULT false;
