#!/usr/bin/env python3
"""
自动化脚本示例：文件整理和报告生成
功能：自动整理下载文件夹，生成文件统计报告
"""

import os
import shutil
from datetime import datetime, timedelta
import pandas as pd
from pathlib import Path
import json

class FileOrganizer:
    def __init__(self, source_dir, organized_dir):
        """
        初始化文件整理器
        
        参数：
        source_dir: 源目录（需要整理的文件夹）
        organized_dir: 整理后的目录
        """
        self.source_dir = Path(source_dir)
        self.organized_dir = Path(organized_dir)
        self.file_categories = {
            '文档': ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'],
            '图片': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'],
            '视频': ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv'],
            '音频': ['.mp3', '.wav', '.flac', '.aac', '.ogg'],
            '表格': ['.xls', '.xlsx', '.csv'],
            '演示文稿': ['.ppt', '.pptx', '.key'],
            '压缩文件': ['.zip', '.rar', '.7z', '.tar', '.gz'],
            '代码': ['.py', '.js', '.html', '.css', '.java', '.cpp', '.c', '.json'],
            '其他': []  # 其他类型文件
        }
        
        # 创建整理目录
        self.organized_dir.mkdir(parents=True, exist_ok=True)
        for category in self.file_categories.keys():
            (self.organized_dir / category).mkdir(exist_ok=True)
    
    def organize_files(self):
        """整理文件到对应分类文件夹"""
        print(f"开始整理文件夹: {self.source_dir}")
        
        stats = {
            'total_files': 0,
            'organized_files': 0,
            'by_category': {},
            'errors': []
        }
        
        # 遍历源目录
        for file_path in self.source_dir.rglob('*'):
            if file_path.is_file():
                stats['total_files'] += 1
                
                try:
                    # 获取文件扩展名
                    ext = file_path.suffix.lower()
                    
                    # 确定文件分类
                    file_category = '其他'
                    for category, extensions in self.file_categories.items():
                        if ext in extensions:
                            file_category = category
                            break
                    
                    # 目标路径
                    target_dir = self.organized_dir / file_category
                    target_path = target_dir / file_path.name
                    
                    # 处理重名文件
                    counter = 1
                    while target_path.exists():
                        name_parts = file_path.stem, file_path.suffix
                        new_name = f"{name_parts[0]}_{counter}{name_parts[1]}"
                        target_path = target_dir / new_name
                        counter += 1
                    
                    # 移动文件
                    shutil.move(str(file_path), str(target_path))
                    
                    # 更新统计
                    stats['organized_files'] += 1
                    if file_category not in stats['by_category']:
                        stats['by_category'][file_category] = 0
                    stats['by_category'][file_category] += 1
                    
                    print(f"已整理: {file_path.name} -> {file_category}/")
                    
                except Exception as e:
                    error_msg = f"整理文件 {file_path.name} 时出错: {str(e)}"
                    stats['errors'].append(error_msg)
                    print(f"错误: {error_msg}")
        
        return stats
    
    def generate_report(self, stats, report_format='all'):
        """生成整理报告"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        report_data = {
            '整理时间': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            '源目录': str(self.source_dir),
            '目标目录': str(self.organized_dir),
            '总文件数': stats['total_files'],
            '成功整理数': stats['organized_files'],
            '失败数': len(stats['errors']),
            '分类统计': stats['by_category'],
            '错误列表': stats['errors']
        }
        
        reports_generated = []
        
        # 生成文本报告
        if report_format in ['text', 'all']:
            text_report = self._generate_text_report(report_data)
            text_file = self.organized_dir / f'file_organization_report_{timestamp}.txt'
            with open(text_file, 'w', encoding='utf-8') as f:
                f.write(text_report)
            reports_generated.append(str(text_file))
            print(f"文本报告已生成: {text_file}")
        
        # 生成JSON报告
        if report_format in ['json', 'all']:
            json_file = self.organized_dir / f'file_organization_report_{timestamp}.json'
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(report_data, f, indent=2, ensure_ascii=False)
            reports_generated.append(str(json_file))
            print(f"JSON报告已生成: {json_file}")
        
        # 生成Excel报告
        if report_format in ['excel', 'all']:
            excel_file = self._generate_excel_report(report_data, timestamp)
            if excel_file:
                reports_generated.append(excel_file)
                print(f"Excel报告已生成: {excel_file}")
        
        return reports_generated
    
    def _generate_text_report(self, report_data):
        """生成文本格式报告"""
        report = f"""
        ========================================
        文件整理报告
        ========================================
        
        整理时间: {report_data['整理时间']}
        源目录: {report_data['源目录']}
        目标目录: {report_data['目标目录']}
        
        统计摘要:
        - 总文件数: {report_data['总文件数']}
        - 成功整理: {report_data['成功整理数']}
        - 失败数: {report_data['失败数']}
        - 成功率: {(report_data['成功整理数'] / report_data['总文件数'] * 100):.1f}%
        
        分类统计:
        """
        
        for category, count in report_data['分类统计'].items():
            report += f"  - {category}: {count} 个文件\n"
        
        if report_data['错误列表']:
            report += f"\n错误列表 ({len(report_data['错误列表'])} 个错误):\n"
            for error in report_data['错误列表']:
                report += f"  • {error}\n"
        else:
            report += "\n错误列表: 无错误\n"
        
        report += """
        ========================================
        备注:
        1. 文件已按类型分类整理
        2. 重名文件已自动重命名
        3. 原始文件结构已改变
        4. 建议定期运行此脚本保持整洁
        ========================================
        """
        
        return report
    
    def _generate_excel_report(self, report_data, timestamp):
        """生成Excel格式报告"""
        try:
            # 创建DataFrame用于分类统计
            category_df = pd.DataFrame(
                list(report_data['分类统计'].items()),
                columns=['文件类型', '文件数量']
            )
            
            # 创建错误DataFrame
            errors_df = pd.DataFrame(
                report_data['错误列表'],
                columns=['错误信息']
            )
            
            # 创建摘要DataFrame
            summary_data = {
                '项目': ['整理时间', '源目录', '目标目录', '总文件数', '成功整理数', '失败数', '成功率'],
                '值': [
                    report_data['整理时间'],
                    report_data['源目录'],
                    report_data['目标目录'],
                    report_data['总文件数'],
                    report_data['成功整理数'],
                    report_data['失败数'],
                    f"{(report_data['成功整理数'] / report_data['总文件数'] * 100):.1f}%"
                ]
            }
            summary_df = pd.DataFrame(summary_data)
            
            # 保存到Excel
            excel_file = self.organized_dir / f'file_organization_report_{timestamp}.xlsx'
            with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
                summary_df.to_excel(writer, sheet_name='摘要', index=False)
                category_df.to_excel(writer, sheet_name='分类统计', index=False)
                if not errors_df.empty:
                    errors_df.to_excel(writer, sheet_name='错误列表', index=False)
                
                # 调整列宽
                for sheet_name in writer.sheets:
                    worksheet = writer.sheets[sheet_name]
                    for column in worksheet.columns:
                        max_length = 0
                        column_letter = column[0].column_letter
                        for cell in column:
                            try:
                                if len(str(cell.value)) > max_length:
                                    max_length = len(str(cell.value))
                            except:
                                pass
                        adjusted_width = min(max_length + 2, 50)
                        worksheet.column_dimensions[column_letter].width = adjusted_width
            
            return str(excel_file)
            
        except Exception as e:
            print(f"生成Excel报告时出错: {str(e)}")
            return None

def create_sample_files():
    """创建示例文件用于演示"""
    sample_dir = Path("sample_downloads")
    sample_dir.mkdir(exist_ok=True)
    
    # 创建各种类型的示例文件
    sample_files = [
        ("document1.pdf", b"PDF document content"),
        ("photo1.jpg", b"JPEG image data"),
        ("video1.mp4", b"MP4 video data"),
        ("music1.mp3", b"MP3 audio data"),
        ("data1.csv", b"name,age\nJohn,30\nJane,25"),
        ("presentation1.pptx", b"PowerPoint data"),
        ("archive1.zip", b"ZIP archive data"),
        ("script1.py", b"print('Hello World')"),
        ("unknown.xyz", b"Unknown file type")
    ]
    
    for filename, content in sample_files:
        file_path = sample_dir / filename
        with open(file_path, 'wb') as f:
            f.write(content)
    
    print(f"示例文件已创建在: {sample_dir}")
    return str(sample_dir)

def cleanup_demo():
    """清理演示文件"""
    import shutil
    
    dirs_to_clean = [
        "sample_downloads",
        "organized_files",
        "sample_customer_data.xlsx",
        "cleaned_customer_data.xlsx",
        "data_cleaning_report.txt"
    ]
    
    for item in dirs_to_clean:
        if os.path.exists(item):
            if os.path.isdir(item):
                shutil.rmtree(item)
                print(f"已删除目录: {item}")
            else:
                os.remove(item)
                print(f"已删除文件: {item}")

if __name__ == "__main__":
    print("=" * 60)
    print("自动化文件整理脚本示例")
    print("=" * 60)
    
    # 创建示例文件
    source_dir = create_sample_files()
    organized_dir = "organized_files"
    
    try:
        # 初始化整理器
        organizer = FileOrganizer(source_dir, organized_dir)
        
        # 整理文件
        print("\n开始整理文件...")
        stats = organizer.organize_files()
        
        # 生成报告
        print("\n生成整理报告...")
        reports = organizer.generate_report(stats, report_format='all')
        
        # 显示统计信息
        print("\n" + "=" * 60)
        print("整理完成!")
        print(f"总文件数: {stats['total_files']}")
        print(f"成功整理: {stats['organized_files']}")
        print(f"失败数: {len(stats['errors'])}")
        
        print("\n分类统计:")
        for category, count in stats['by_category'].items():
            print(f"  {category}: {count} 个文件")
        
        print(f"\n生成的报告: {', '.join(reports)}")
        
        print("\n" + "=" * 60)
        print("此脚本展示了我们的自动化能力")
        print("实际项目会根据具体需求定制")
        print("=" * 60)
        
        # 询问是否清理演示文件
        response = input("\n是否清理演示文件? (y/n): ")
        if response.lower() == 'y':
            cleanup_demo()
            print("演示文件已清理")
        
    except Exception as e:
        print(f"执行过程中出错: {e}")
        import traceback
        traceback.print_exc()