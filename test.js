// const apiKey = '.............';
// const uri = '.............';

import OpenAI from "openai";
import fs from 'fs';
import sanitize from 'sanitize-filename';
import { exec } from "child_process";
import { MongoClient } from 'mongodb';

const client = new MongoClient(uri);
const openai = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey });

const description1 = `
我需要你帮助我解决一个编程题，题目描述如下:
`;

const description2 = `
请按照以下要求完成:
1. 生成该题目的 C++ 解题代码：
   - 代码必须能够编译和运行。
   - 输入输出的格式要严格按照题目要求，不允许有多余或遗漏的部分。
   - 代码使用 #include <bits/stdc++.h> 和 using namespace std; 形式。
2. 为我生成一个 Python 函数 \`generate_test_data\`，该函数用于随机生成符合题目要求的输入数据, 请参考以下代码框架来写这个函数：
   - Python 代码无需导入其他库，因为这个函数是文件中的一部分。
   - 默认 total_cases = 5 代表生成五组输入和输出数据。如果题目没有输入，则将 total_cases 设为 1，并且不需要 input_writeln。
   以下几种写法都可以, 不需要 join 和 map 等
     # io.input_write(1, 2, 3) # 写入1 2 3到输入文件
     # io.input_writeln(4, 5, 6) # 写入4 5 6到输入文件并换行
     # io.output_write(1, 2, 3) # 写入1 2 3到输出文件
     # io.output_writeln(4, 5, 6) # 写入4 5 6到输出文件并换行
     # io.input_write([1, 2, 3]) # 写入1 2 3到输入文件
\`\`\`python
def generate_test_data():
    total_cases = 5 
    for i in range(1, total_cases + 1):
        io = IO(file_prefix="", data_id=i)  # 创建一个测试数据对象
        n = randint(1, 1000)
        io.input_writeln(n) 
        io.output_gen("std.exe")
generate_test_data()
\`\`\`
这两部分内容的格式必须如下, 不要有其他回答:
1. C++ 代码
\`\`\`cpp
内容
\`\`\`
2. Python 代码
\`\`\`python
内容
\`\`\`
`;

async function query(database, docId) {
    console.log(`正在查询文档 ID: ${docId}`);
    const collection = database.collection('document');
    const doc = await collection.findOne({ pid: docId });
    console.log(`文档 ID: ${docId} 查询完成`);
    return doc;
}

async function processDocument(doc) {
    console.log(`处理文档 ID: ${doc.docId}`);

    // 创建一个文件夹以 docId 为名字
    const folderName = sanitize(`${doc.pid}${doc.title}`);
    if (!fs.existsSync(folderName)) {
        fs.mkdirSync(folderName);
        console.log(`创建文件夹: ${folderName}`);
    }

    // 将描述和文档内容合并
    const content = description1 + doc.content + description2;
    console.log(`生成请求内容完成`);

    // 调用 AI 获取代码
    console.log(`调用 AI 获取代码...`);
    const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content }],
        model: "deepseek-chat",
    });

    const response = completion.choices[0].message.content;

    // 分割 C++ 代码和 Python 代码
    const cppCode = response.match(/```cpp\n([\s\S]*?)```/)[1];
    const pythonCode = response.match(/```python\n([\s\S]*?)```/)[1];

    // 将 C++ 代码写入 test.cpp
    fs.writeFileSync(`${folderName}/std.cpp`, cppCode);
    console.log(`C++ 代码已写入 ${folderName}/std.cpp`);

    // 将 Python 代码的 generate_test_data 部分替换 generate_test_data.py 中的方法
    let generateTestDataPy = fs.readFileSync('generate_test_data.py', 'utf-8');

    // 使用更宽松的正则表达式替换 generate_test_data 方法
    const updatedGenerateTestDataPy = generateTestDataPy.replace(
        /def generate_test_data[\s\S]*?(?=\n\n|$)/g,  // 匹配整个函数定义部分
        pythonCode
    );

    // 将更新后的内容写回 generate_test_data.py
    fs.writeFileSync(`${folderName}/generate_test_data.py`, updatedGenerateTestDataPy);
    console.log(`Python 代码已更新 ${folderName}/generate_test_data.py`);

    // 编译并运行 generate_test_data.py
    console.log(`正在运行 generate_test_data.py...`);
    exec('python generate_test_data.py', { cwd: folderName }, (error, stdout, stderr) => {
        if (error) {
            console.error(`执行错误: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`错误输出: ${stderr}`);
            return;
        }
        console.log(`标准输出: ${stdout}`);
    });
}

async function main() {
    console.log('连接到 MongoDB 服务器...');
    // 连接到 MongoDB 服务器
    await client.connect();
    const database = client.db('test'); // 替换为你的数据库名称

    for (let docId = 5; docId <= 482; docId++) {
        console.log(`正在处理文档 ID: ${docId}`);
        // 获取单个文档
        const doc = await query(database, 'X'+docId);

        if (doc) {
            // 处理文档
            await processDocument(doc);
        } else {
            console.log(`文档 ID ${docId} 不存在`);
        }
    }

    // 关闭 MongoDB 连接
    console.log('关闭 MongoDB 连接...');
    await client.close();
    console.log('MongoDB 连接已关闭');
}

main().catch(console.error);
