import { PageHeader } from "@/components/layout/PageHeader";
import { ArticleFeed } from "@/components/feed/ArticleFeed";
import { useLanguage } from "@/lib/i18n";

/** Your Feed — the full article stream, with search over article bodies. */
export default function Feed() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader title={t("feed.title")} subtitle={t("feed.subtitle")} />
      <ArticleFeed />
    </>
  );
}
