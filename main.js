import { appendFileSync } from "fs";

// 使用新的域名
const host = process.env.HOST || "ikuuu.de";

const logInUrl = `https://${host}/auth/login`;
const checkInUrl = `https://${host}/user/checkin`;

// 格式化 Cookie
function formatCookie(rawCookieArray) {
  const cookiePairs = new Map();

  for (const cookieString of rawCookieArray) {
    const match = cookieString.match(/^\s*([^=]+)=([^;]*)/);
    if (match) {
      cookiePairs.set(match[1].trim(), match[2].trim());
    }
  }

  return Array.from(cookiePairs)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

// 登录获取 Cookie
async function logIn(account) {
  console.log(`${account.name}: 登录中...`);

  const loginPayload = {
    email: account.email,
    passwd: account.passwd,
    code: "",
    remember_me: false,
  };

  const response = await fetch(logInUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Referer": `https://${host}/auth/login`,
      "Origin": `https://${host}`,
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(loginPayload),
  });

  if (!response.ok) {
    throw new Error(`网络请求出错 - ${response.status} ${response.statusText}`);
  }

  let rawCookieArray = response.headers.getSetCookie();
  const responseJson = await response.json();

  if (responseJson.ret !== 1) {
    throw new Error(`登录失败: ${responseJson.msg}`);
  } else {
    console.log(`${account.name}: ${responseJson.msg}`);
  }

  if (!rawCookieArray || rawCookieArray.length === 0) {
    throw new Error("获取 Cookie 失败");
  }

  return { ...account, cookie: formatCookie(rawCookieArray) };
}

// 签到
async function checkIn(account) {
  console.log(`${account.name}: 开始签到...`);

  const response = await fetch(checkInUrl, {
    method: "POST",
    headers: {
      "Cookie": account.cookie,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Referer": `https://${host}/user`,
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (!response.ok) {
    throw new Error(`签到请求失败 - ${response.status}`);
  }

  const data = await response.json();
  console.log(`${account.name}: ${data.msg}`);

  return data.msg;
}

// 处理单个账户
async function processSingleAccount(account) {
  try {
    const loggedInAccount = await logIn(account);
    return await checkIn(loggedInAccount);
  } catch (error) {
    throw new Error(`${account.name}: ${error.message}`);
  }
}

// 写入 GitHub 输出
function setGitHubOutput(name, value) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${value}\nEOF\n`);
}

// 入口函数
async function main() {
  let accounts;

  try {
    if (!process.env.ACCOUNTS) {
      throw new Error("❌ 未配置账户信息。");
    }

    accounts = JSON.parse(process.env.ACCOUNTS);
  } catch (error) {
    const message = `❌ ${
      error.message.includes("JSON") ? "账户信息配置格式错误。" : error.message
    }`;
    console.error(message);
    setGitHubOutput("result", message);
    process.exit(1);
  }

  const allPromises = accounts.map(processSingleAccount);
  const results = await Promise.allSettled(allPromises);

  const msgHeader = "\n======== 签到结果 ========\n\n";
  console.log(msgHeader);

  let hasError = false;
  const resultLines = [];

  results.forEach((result, index) => {
    const accountName = accounts[index].name;
    const isSuccess = result.status === "fulfilled";
    const icon = isSuccess ? "✅" : "❌";
    const message = isSuccess ? result.value : result.reason.message;

    const line = `${accountName}: ${icon} ${message}`;
    resultLines.push(line);

    isSuccess ? console.log(line) : console.error(line);

    if (!isSuccess) hasError = true;
  });

  const resultMsg = resultLines.join("\n");
  setGitHubOutput("result", resultMsg);

  if (hasError) {
    process.exit(1);
  }
}

main();
