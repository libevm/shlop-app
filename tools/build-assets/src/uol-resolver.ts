/**
 * Link/UOL/outlink resolver for WZ node trees.
 *
 * Phase 3, Step 13.
 *
 * WZ files use several linking mechanisms:
 * - UOL (User Object Link): `$uol` property with a relative path like "../../stand1/0/body"
 * - _inlink: Internal link within the same .img file
 * - _outlink: External link to another .img file
 *
 * This resolver traverses a parsed WZ JSON tree and resolves UOL references
 * to their target nodes. It supports both strict mode (fail on unresolved)
 * and permissive mode (warn and continue).
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface WzNode {
  $imgdir?: string;
  $canvas?: string | number;
  $uol?: string;
  $$?: WzNode[];
  [key: string]: unknown;
}

export interface ResolveResult {
  /** Total UOL/link references found */
  totalReferences: number;
  /** Successfully resolved count */
  resolvedCount: number;
  /** Unresolved references */
  unresolved: UnresolvedRef[];
}

export interface UnresolvedRef {
  /** Path to the node containing the reference */
  nodePath: string;
  /** The reference value (UOL path, inlink, outlink) */
  refValue: string;
  /** Type of reference */
  refType: "uol" | "inlink" | "outlink";
}

// ─── UOL Resolution ─────────────────────────────────────────────────

/**
 * Navigate a WZ node tree by path segments.
 * Supports ".." for parent traversal.
 *
 * @param root - The root node of the tree
 * @param segments - Path segments to follow
 * @param parentChain - Stack of parent nodes for ".." resolution
 * @returns The target node, or null if not found
 */
function navigatePath(
  root: WzNode,
  segments: string[],
  parentChain: WzNode[]
): WzNode | null {
  let current: WzNode = root;

  for (const seg of segments) {
    if (seg === "..") {
      if (parentChain.length === 0) return null;
      current = parentChain.pop()!;
      continue;
    }

    // Find child by $imgdir or $canvas name
    const children = current.$$ ?? [];
    const child = children.find(
      (c) => c.$imgdir === seg || String(c.$canvas) === seg
    );

    if (!child) return null;

    parentChain.push(current);
    current = child;
  }

  return current;
}

/**
 * Build a parent chain from root to a target node path.
 */
function buildParentChain(
  root: WzNode,
  path: string[]
): { node: WzNode; parents: WzNode[] } | null {
  let current = root;
  const parents: WzNode[] = [];

  for (const seg of path) {
    const children = current.$$ ?? [];
    const child = children.find(
      (c) => c.$imgdir === seg || String(c.$canvas) === seg
    );
    if (!child) return null;
    parents.push(current);
    current = child;
  }

  return { node: current, parents };
}

/**
 * Resolve a single UOL path relative to a source node position.
 *
 * UOL paths are relative to the PARENT of the UOL node (like filesystem
 * symlinks). So `../../stand1/0/body` from `walk1/0/body` navigates:
 *   parent of body = walk1/0
 *   ../.. from walk1/0 = root
 *   stand1/0/body from root
 *
 * @param root - The tree root
 * @param sourcePath - Path segments from root to the UOL node
 * @param uolPath - The UOL reference string (e.g., "../../stand1/0/body")
 * @returns The resolved target node, or null
 */
export function resolveUol(
  root: WzNode,
  sourcePath: string[],
  uolPath: string
): WzNode | null {
  // Build parent chain up to the source node's PARENT
  // (UOL paths are relative to the containing directory)
  const parentPath = sourcePath.slice(0, -1);
  const chain = buildParentChain(root, parentPath);
  if (!chain) return null;

  const segments = uolPath.split("/").filter((s) => s.length > 0);
  const parentStack = [...chain.parents];

  return navigatePath(chain.node, segments, parentStack);
}

/**
 * Resolve an inlink path (absolute path within the same .img tree).
 */
export function resolveInlink(root: WzNode, inlinkPath: string): WzNode | null {
  const segments = inlinkPath.split("/").filter((s) => s.length > 0);
  let current = root;

  for (const seg of segments) {
    const children = current.$$ ?? [];
    const child = children.find(
      (c) => c.$imgdir === seg || String(c.$canvas) === seg
    );
    if (!child) return null;
    current = child;
  }

  return current;
}

/**
 * Recursively find all UOL/link references in a WZ node tree.
 */
export function findAllReferences(
  node: WzNode,
  currentPath: string[] = []
): Array<{ path: string[]; refType: "uol" | "inlink" | "outlink"; refValue: string }> {
  const refs: Array<{ path: string[]; refType: "uol" | "inlink" | "outlink"; refValue: string }> = [];

  if (node.$uol !== undefined) {
    refs.push({
      path: [...currentPath],
      refType: "uol",
      refValue: String(node.$uol),
    });
  }

  // Check for _inlink/_outlink in leaf values
  const children = node.$$ ?? [];
  for (const child of children) {
    if (typeof child === "object" && child !== null) {
      const childName = child.$imgdir ?? String(child.$canvas ?? "");
      const childPath = childName ? [...currentPath, childName] : currentPath;

      // Check for _inlink property
      if ("_inlink" in child && typeof child._inlink === "string") {
        refs.push({
          path: childPath,
          refType: "inlink",
          refValue: child._inlink,
        });
      }

      // Check for _outlink property
      if ("_outlink" in child && typeof child._outlink === "string") {
        refs.push({
          path: childPath,
          refType: "outlink",
          refValue: child._outlink,
        });
      }

      // Recurse
      const subRefs = findAllReferences(child, childPath);
      refs.push(...subRefs);
    }
  }

  return refs;
}

/**
 * Resolve all UOL and inlink references in a tree.
 * outlinks require external file access and are recorded as unresolved.
 *
 * @param root - Tree root node
 * @param options - strict: throw on unresolved; permissive (default): collect and continue
 */
export function resolveAllReferences(
  root: WzNode,
  options?: { strict?: boolean }
): ResolveResult {
  const strict = options?.strict ?? false;
  const refs = findAllReferences(root);
  const unresolved: UnresolvedRef[] = [];
  let resolvedCount = 0;

  for (const ref of refs) {
    let resolved: WzNode | null = null;

    if (ref.refType === "uol") {
      resolved = resolveUol(root, ref.path, ref.refValue);
    } else if (ref.refType === "inlink") {
      resolved = resolveInlink(root, ref.refValue);
    }
    // outlinks always unresolved in single-tree mode

    if (resolved !== null) {
      resolvedCount++;
    } else {
      const unresolvedRef: UnresolvedRef = {
        nodePath: ref.path.join("/"),
        refValue: ref.refValue,
        refType: ref.refType,
      };
      unresolved.push(unresolvedRef);

      if (strict) {
        throw new Error(
          `Unresolved ${ref.refType} reference at "${unresolvedRef.nodePath}": "${ref.refValue}"`
        );
      }
    }
  }

  return {
    totalReferences: refs.length,
    resolvedCount,
    unresolved,
  };
}
