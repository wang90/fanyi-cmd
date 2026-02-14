// MongoDB连接（可选依赖）
let MongoClient = null;
const DB_NAME = 'ai-cmd';
const COLLECTION_NAME = 'history';
const MONGO_URI = 'mongodb://localhost:27017';

async function createDbClient() {
  // 动态导入mongodb，如果未安装则跳过
  if (!MongoClient) {
    const mongodb = await import('mongodb');
    MongoClient = mongodb.MongoClient;
  }

  const client = new MongoClient(MONGO_URI, {
    // 避免本地未启动 MongoDB 时 CLI 长时间等待
    serverSelectionTimeoutMS: 1500,
  });
  await client.connect();
  return { client, db: client.db(DB_NAME) };
}

// 保存翻译历史（供CLI调用）
export async function saveHistory(text, result, config) {
  let client = null;
  try {
    const conn = await createDbClient();
    client = conn.client;
    const collection = conn.db.collection(COLLECTION_NAME);
    await collection.insertOne({
      text,
      result,
      provider: config.provider || 'libre',
      from: config.from || 'auto',
      to: config.to || 'zh',
      timestamp: new Date(),
    });
  } catch (error) {
    // 静默失败，不影响翻译功能
  } finally {
    // CLI 保存完历史后主动释放连接，避免进程卡住不退出
    if (client) {
      try {
        await client.close();
      } catch (closeErr) {
        // 忽略关闭失败
      }
    }
  }
}
