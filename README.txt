Zupona AI (ai.zupona.com) - all code

1. ai-platform-foundation/
   The main AI branch (origin/ai-platform-foundation). Every file it adds or
   changes compared with the live shop (main), as full files with their paths.

2. latest-task-06-durable-project-storage/
   The newest and most complete AI branch (21 Oct 2026). Same format.

3. zupona-ai-all-branches.bundle
   A git bundle holding every branch that has AI code (about 70) plus main,
   with full history. Nothing is left out. To open it:
     git clone zupona-ai-all-branches.bundle zupona-ai
     cd zupona-ai
     git branch -a

4. branches.txt
   The list of those branches, newest first, with each one's last commit.

Note: src/proxy.ts, package.json and similar files inside the folders are the
whole project file from that branch, not just the AI part. The files only run
inside the Zupona Next.js project; they are not a separate app.
What is live on ai.zupona.com today is only the landing page on main
(src/app/ai/page.tsx). The AI studio work in these branches is not merged into
main yet.
