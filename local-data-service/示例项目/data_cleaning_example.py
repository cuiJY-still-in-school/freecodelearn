#!/usr/bin/env python3
"""
数据清洗示例脚本
功能：清洗客户数据Excel文件
"""

import pandas as pd
import numpy as np
from datetime import datetime
import os

def clean_customer_data(input_file, output_file):
    """
    清洗客户数据的主要函数
    
    参数：
    input_file: 输入Excel文件路径
    output_file: 输出Excel文件路径
    
    返回：
    清洗后的DataFrame和统计信息
    """
    print(f"开始清洗数据: {input_file}")
    
    try:
        # 1. 读取数据
        df = pd.read_excel(input_file)
        print(f"原始数据形状: {df.shape}")
        print(f"原始列名: {list(df.columns)}")
        
        # 2. 重命名列（标准化）
        column_mapping = {
            '客户姓名': 'customer_name',
            '客户名字': 'customer_name',
            '姓名': 'customer_name',
            '客户电话': 'phone',
            '电话': 'phone',
            '联系电话': 'phone',
            '邮箱': 'email',
            '电子邮件': 'email',
            '地址': 'address',
            '注册日期': 'registration_date',
            '加入日期': 'registration_date',
            '消费金额': 'purchase_amount',
            '订单金额': 'purchase_amount'
        }
        
        df = df.rename(columns=lambda x: column_mapping.get(x.strip(), x))
        
        # 3. 处理缺失值
        initial_rows = len(df)
        df = df.dropna(subset=['customer_name', 'phone'])  # 关键信息不能缺失
        print(f"删除缺失关键信息的行: {initial_rows - len(df)}")
        
        # 4. 标准化电话号码
        if 'phone' in df.columns:
            df['phone'] = df['phone'].astype(str).str.replace(r'\D', '', regex=True)
            # 保留有效电话号码（假设为11位手机号）
            df = df[df['phone'].str.len() == 11]
        
        # 5. 标准化邮箱
        if 'email' in df.columns:
            df['email'] = df['email'].astype(str).str.lower().str.strip()
            # 简单的邮箱格式验证
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            df = df[df['email'].str.match(email_pattern, na=False)]
        
        # 6. 处理日期字段
        if 'registration_date' in df.columns:
            df['registration_date'] = pd.to_datetime(df['registration_date'], errors='coerce')
            # 删除无效日期
            df = df[df['registration_date'].notna()]
        
        # 7. 处理金额字段
        if 'purchase_amount' in df.columns:
            # 移除货币符号和逗号，转换为数值
            df['purchase_amount'] = (
                df['purchase_amount']
                .astype(str)
                .str.replace(r'[^\d.]', '', regex=True)
                .astype(float)
            )
            # 将负数转换为正数（假设都是正数）
            df['purchase_amount'] = df['purchase_amount'].abs()
        
        # 8. 去重处理
        before_dedup = len(df)
        df = df.drop_duplicates(subset=['phone', 'email'], keep='first')
        print(f"删除重复记录: {before_dedup - len(df)}")
        
        # 9. 添加清洗元数据
        df['data_cleaned_date'] = datetime.now().strftime('%Y-%m-%d')
        df['data_source'] = os.path.basename(input_file)
        
        # 10. 保存清洗后的数据
        df.to_excel(output_file, index=False)
        
        # 生成统计信息
        stats = {
            'original_rows': initial_rows,
            'cleaned_rows': len(df),
            'removed_rows': initial_rows - len(df),
            'removal_rate': f"{((initial_rows - len(df)) / initial_rows * 100):.1f}%",
            'columns_cleaned': list(df.columns),
            'output_file': output_file,
            'completion_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        print(f"数据清洗完成!")
        print(f"原始行数: {stats['original_rows']}")
        print(f"清洗后行数: {stats['cleaned_rows']}")
        print(f"移除行数: {stats['removed_rows']} ({stats['removal_rate']})")
        print(f"输出文件: {stats['output_file']}")
        
        return df, stats
        
    except Exception as e:
        print(f"数据清洗过程中出错: {str(e)}")
        raise

def generate_report(stats, report_file):
    """生成清洗报告"""
    report_content = f"""
    ================================
    数据清洗报告
    ================================
    
    项目: 客户数据清洗
    完成时间: {stats['completion_time']}
    
    统计信息:
    - 原始数据行数: {stats['original_rows']}
    - 清洗后行数: {stats['cleaned_rows']}
    - 移除行数: {stats['removed_rows']} ({stats['removal_rate']})
    
    清洗操作:
    1. 列名标准化
    2. 缺失值处理
    3. 电话号码标准化
    4. 邮箱格式验证和标准化
    5. 日期格式统一
    6. 金额数据清理
    7. 重复记录删除
    
    输出文件: {stats['output_file']}
    包含列: {', '.join(stats['columns_cleaned'])}
    
    ================================
    备注:
    - 所有个人身份信息已标准化处理
    - 无效和重复记录已移除
    - 数据格式已统一，适合进一步分析
    ================================
    """
    
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report_content)
    
    print(f"清洗报告已生成: {report_file}")
    return report_content

def create_sample_data():
    """创建示例数据用于演示"""
    sample_data = {
        '客户姓名': ['张三', '李四', '王五', '赵六', '钱七', '孙八', None, '周九'],
        '电话': ['13800138000', '13900139000', '13800138000', '12345', '15000150000', '15000150000', '15100151000', '15200152000'],
        '邮箱': ['zhangsan@example.com', 'lisi@example.com', 'wangwu@example.com', 'invalid-email', 'qianqi@example.com', 'sunba@example.com', 'test@test.com', 'zhoujiu@example.com'],
        '地址': ['北京朝阳', '上海浦东', '广州天河', '深圳南山', '杭州西湖', '成都锦江', '南京鼓楼', '武汉汉口'],
        '注册日期': ['2023-01-15', '2023-02-20', '2023-03-10', '2023-01-15', 'invalid-date', '2023-05-01', '2023-06-15', '2023-07-20'],
        '消费金额': ['¥1,000.50', '800.00', '1,200.75', '500', '三百元', '900.25', '1100', '750.50']
    }
    
    df = pd.DataFrame(sample_data)
    input_file = 'sample_customer_data.xlsx'
    df.to_excel(input_file, index=False)
    print(f"示例数据已创建: {input_file}")
    return input_file

if __name__ == "__main__":
    print("=" * 50)
    print("数据清洗示例脚本")
    print("=" * 50)
    
    # 创建示例数据
    input_file = create_sample_data()
    
    # 设置输出文件
    output_file = 'cleaned_customer_data.xlsx'
    report_file = 'data_cleaning_report.txt'
    
    try:
        # 执行数据清洗
        cleaned_df, stats = clean_customer_data(input_file, output_file)
        
        # 生成报告
        report = generate_report(stats, report_file)
        
        # 显示清洗后的数据预览
        print("\n清洗后的数据预览:")
        print(cleaned_df.head())
        
        print("\n" + "=" * 50)
        print("示例执行完成!")
        print("此脚本展示了我们的数据清洗能力")
        print("实际项目会根据具体需求定制")
        print("=" * 50)
        
    except Exception as e:
        print(f"执行过程中出错: {e}")
    
    # 清理示例文件（可选）
    # import os
    # if os.path.exists(input_file):
    #     os.remove(input_file)
    #     print(f"已清理示例文件: {input_file}")