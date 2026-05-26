import { redirect } from "next/navigation";

/** 루트는 별도 랜딩 없이 기본 조회 화면으로 이동 */
export default function Home() {
  redirect("/map-konva");
}
