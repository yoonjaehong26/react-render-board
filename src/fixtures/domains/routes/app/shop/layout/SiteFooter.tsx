function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div className="site-footer-v2__col">
      <h4>{title}</h4>
      <ul>
        {links.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer-v2">
      <FooterColumn title="고객센터" links={['공지사항', '자주 묻는 질문', '1:1 문의']} />
      <FooterColumn title="쇼핑" links={['오늘의 특가', '베스트', '신상품']} />
      <FooterColumn title="회사" links={['소개', '채용', '이용약관']} />
      <p className="site-footer-v2__copy">© Rendera Inc. — react-render-board 데모용 가상 쇼핑몰</p>
    </footer>
  );
}
