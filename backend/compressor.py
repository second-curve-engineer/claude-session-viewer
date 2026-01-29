"""会话压缩模块 - 将历史对话压缩为紧凑的 Markdown 格式"""
from typing import List
from models import Message, ToolCall


def compress_session(messages: List[Message]) -> str:
    """
    压缩会话内容为 Markdown 格式

    保留：用户问题 + Claude 结论性回答 + 文件修改记录
    删除：thinking、过渡性文字、探索性工具调用结果

    Args:
        messages: 消息列表

    Returns:
        压缩后的 Markdown 字符串
    """
    # 过滤掉非对话消息
    dialog_messages = [m for m in messages if m.type in ('user', 'assistant')]

    if not dialog_messages:
        return "无对话内容"

    lines = ["## 历史对话", ""]
    turns = _group_into_turns(dialog_messages)

    for i, turn in enumerate(turns, 1):
        lines.append("---")
        lines.append(f"### 第{i}轮")
        lines.append("")

        # 完整用户问题
        if turn.get('user'):
            lines.append(f"**用户**：{turn['user']}")
            lines.append("")

        # Claude 回答（清理过渡性文字）
        if turn.get('assistant'):
            answer = _clean_assistant_text(turn['assistant'])
            if answer:
                lines.append(f"**Claude**：{answer}")
                lines.append("")

        # 只保留有价值的工具详情（Edit/Write）
        valuable_tools = [t for t in turn.get('tool_details', [])
                        if t['name'] in ('Edit', 'Write')]
        if valuable_tools:
            lines.append("**文件修改**：")
            for tool in valuable_tools:
                path = tool.get('input_summary', '')
                filename = path.split('/')[-1] if path else ''
                lines.append(f"- {tool['name']}: {filename}")
            lines.append("")

    return "\n".join(lines)


def _clean_assistant_text(text: str) -> str:
    """清理 Claude 回答文本（移除多余空行）"""
    if not text:
        return ""
    # 保留原始内容，只做基本清理
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    return '\n\n'.join(paragraphs)


def _group_into_turns(messages: List[Message]) -> List[dict]:
    """
    将消息分组为对话轮次
    一轮 = 用户消息 + 若干 assistant 消息（包含工具调用）
    """
    turns = []
    current_turn = None

    for msg in messages:
        if msg.type == 'user':
            # 新的一轮开始
            if current_turn:
                turns.append(current_turn)
            current_turn = {
                'user': msg.content,
                'assistant': '',
                'tool_details': []
            }
        elif msg.type == 'assistant' and current_turn:
            # 累积 assistant 回答
            if msg.content:
                if current_turn['assistant']:
                    current_turn['assistant'] += "\n\n"
                current_turn['assistant'] += msg.content

            # 提取工具调用
            if msg.tool_calls:
                for tool in msg.tool_calls:
                    current_turn['tool_details'].append({
                        'name': tool.name,
                        'input_summary': _get_file_path(tool),
                    })

    # 添加最后一轮
    if current_turn:
        turns.append(current_turn)

    return turns


def _get_file_path(tool: ToolCall) -> str:
    """从工具调用中提取文件路径"""
    input_data = tool.input or {}
    return input_data.get('file_path', '')
