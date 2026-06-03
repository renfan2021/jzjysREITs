# jzjysREITs GitHub Pages 部署说明

这个压缩包只包含可公开访问的静态网页文件。

## 部署方式

1. 新建一个 GitHub 仓库，例如 `jzjysREITs`。
2. 解压本压缩包，把里面的所有文件上传到仓库根目录。
3. 进入仓库 `Settings -> Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`。
6. 保存后等待 GitHub Pages 生成网址。

## 访问地址

如果仓库名是 `jzjysREITs`，通常网址类似：

```text
https://<github用户名>.github.io/jzjysREITs/
```

打开后会进入看板；也可以访问：

```text
https://<github用户名>.github.io/jzjysREITs/jzjysREITs/
```

## 更新数据

每周更新时，需要先在本地用新的 Excel 重新生成 `assets/data.js`，再把新的 `assets/data.js` 上传到 GitHub。
