import { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";
import { JSDOM } from "jsdom";

/**
 * OGPタグを取得して、そのcontentをJSON形式で返す.
 * 使用例:
 *    endpoint/api/ogp?url="サイトのURL"
 *
 * @param req HTTP request
 * @param res HTTP responce
 */
export default async function (req: VercelRequest, res: VercelResponse) {
  const url = getUrlParameter(req);
  if (!url) {
    errorResponce(res);
    return;
  }

  try {
    const responce = await axios.get(url);
    const data = responce.data;
    const dom = new JSDOM(data);
    const meta = dom.window.document.querySelectorAll("head > meta");

    // metaからOGPを抽出し、JSON形式に変換する
    const ogp = Array.from(meta)
      .filter((element) => element.hasAttribute("property"))
      .reduce<Record<string, string | null>>((pre, ogp) => {
        const property = ogp.getAttribute("property")!.trim().replace("og:", "");
        const content = ogp.getAttribute("content");
        pre[property] = content;
        return pre;
      }, {});
    res.status(200).json(ogp);
  } catch (e) {
    errorResponce(res);
  }
}

function isValidUrlParameter(
  url: string | string[] | undefined,
): url is string {
  return !(url == undefined || url == null || Array.isArray(url));
}

function getUrlParameter(req: VercelRequest): string | null {
  const { url } = req.query;
  if (isValidUrlParameter(url)) {
    return url;
  }
  return null;
}

function errorResponce(res: VercelResponse): void {
  res.status(400).send("error");
}
