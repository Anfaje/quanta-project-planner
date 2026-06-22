import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { DraftListItem } from "../lib/types";
import { useMe } from "../context/AuthContext";
import { Layout } from "../components/Layout";
import {
  Card,
  Spinner,
  Alert,
  EmptyState,
  Badge,
  PageHeader,
  Button,
  Tabs,
  TabPanel,
} from "../components/ui";
import { formatDate } from "../lib/format";

/**
 * Drafts — proposed projects that aren't active yet.
 *
 * GET /api/projects/drafts returns every draft the caller can see (their own,
 * ones shared with them, and — for approvers — ones they have mandate over),
 * each row flagged with isOwner + canApprove. We split that union into three
 * tabs client-side:
 *   - My drafts            (isOwner)
 *   - Pending my approval  (canApprove && !isOwner)
 *   - Shared with me       (!isOwner && !canApprove — a reviewer without mandate)
 */

type DraftTab = "mine" | "pending" | "shared";

export function DraftsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const canCreate = me.roles.some((r) => ["PM", "BUL", "AC", "AA"].includes(r));

  const { data, isLoading, error } = useQuery({
    queryKey: ["drafts"],
    queryFn: () => api.get<{ drafts: DraftListItem[] }>("/api/projects/drafts"),
  });

  const { mine, pending, shared } = useMemo(() => {
    const all = data?.drafts ?? [];
    return {
      mine: all.filter((d) => d.isOwner),
      pending: all.filter((d) => !d.isOwner && d.canApprove),
      shared: all.filter((d) => !d.isOwner && !d.canApprove),
    };
  }, [data]);

  const [tab, setTab] = useState<DraftTab>("mine");

  const TABS = [
    { id: "mine" as const, label: `My drafts (${mine.length})` },
    { id: "pending" as const, label: `Pending my approval (${pending.length})` },
    { id: "shared" as const, label: `Shared with me (${shared.length})` },
  ];

  return (
    <Layout>
      <PageHeader
        title="Drafts"
        subtitle="Proposed projects awaiting approval — these don't affect cost or revenue until approved."
        actions={
          canCreate ? (
            <Button onClick={() => navigate("/projects/new")}>New project</Button>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="md" color="indigo" />
        </div>
      )}

      {error && (
        <Alert tone="rose" title="Couldn't load drafts">
          {String(error)}
        </Alert>
      )}

      {data && (
        <>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          <div className="mt-6">
            <TabPanel id="mine" active={tab === "mine"}>
              <DraftTable
                drafts={mine}
                emptyTitle="No drafts yet"
                emptyDescription="Start a project and choose “Save as Draft” to model the numbers before it's approved."
                showOwner={false}
              />
            </TabPanel>
            <TabPanel id="pending" active={tab === "pending"}>
              <DraftTable
                drafts={pending}
                emptyTitle="Nothing awaiting your approval"
                emptyDescription="Drafts you can approve will appear here."
                showOwner
              />
            </TabPanel>
            <TabPanel id="shared" active={tab === "shared"}>
              <DraftTable
                drafts={shared}
                emptyTitle="Nothing shared with you"
                emptyDescription="Drafts a colleague asks you to review will appear here."
                showOwner
              />
            </TabPanel>
          </div>
        </>
      )}
    </Layout>
  );
}

function DraftTable({
  drafts,
  emptyTitle,
  emptyDescription,
  showOwner,
}: {
  drafts: DraftListItem[];
  emptyTitle: string;
  emptyDescription: string;
  showOwner: boolean;
}) {
  if (drafts.length === 0) {
    return (
      <Card>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Draft</th>
              <th className="text-left px-6 py-3 font-medium">Account</th>
              <th className="text-left px-6 py-3 font-medium">BU</th>
              {showOwner && <th className="text-left px-6 py-3 font-medium">Owner</th>}
              <th className="text-right px-6 py-3 font-medium">Team</th>
              <th className="text-left px-6 py-3 font-medium">Updated</th>
              <th className="text-right px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {drafts.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-6 py-3">
                  <Link
                    to={`/projects/${d.id}`}
                    className="font-medium text-gray-900 hover:text-indigo-600"
                  >
                    {d.name}
                  </Link>
                  <div className="text-xs text-gray-400">{d.projectCode}</div>
                </td>
                <td className="px-6 py-3 text-gray-600">{d.account.name}</td>
                <td className="px-6 py-3">
                  <Badge>{d.owningBu.code}</Badge>
                </td>
                {showOwner && (
                  <td className="px-6 py-3 text-gray-600">{d.createdBy.name}</td>
                )}
                <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                  {d.resourceCount}
                </td>
                <td className="px-6 py-3 text-xs text-gray-500">{formatDate(d.updatedAt)}</td>
                <td className="px-6 py-3 text-right">
                  {d.changesRequested ? (
                    <Badge tone="amber">Changes requested</Badge>
                  ) : (
                    <Badge tone="indigo">Draft</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
