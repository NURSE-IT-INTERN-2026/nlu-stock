"use client";

import { useState } from "react";

export function usePagination(initialPerPage = 20) {
  const [page, setPage] = useState(1);
  const [perPage] = useState(initialPerPage);
  const [total, setTotal] = useState(0);

  const totalPages = Math.ceil(total / perPage);
  const resetPage = () => setPage(1);

  return { page, setPage, perPage, total, setTotal, totalPages, resetPage };
}
