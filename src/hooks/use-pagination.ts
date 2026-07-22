"use client";

import { useState } from "react";
import { PAGE_SIZE } from "@/lib/pagination-constants";

export function usePagination(initialPerPage = PAGE_SIZE.DEFAULT) {
  const [page, setPage] = useState(1);
  const [perPage] = useState(initialPerPage);
  const [total, setTotal] = useState(0);

  const totalPages = Math.ceil(total / perPage);
  const resetPage = () => setPage(1);

  return { page, setPage, perPage, total, setTotal, totalPages, resetPage };
}
