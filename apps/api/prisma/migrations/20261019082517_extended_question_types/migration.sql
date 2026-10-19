-- AlterTable
ALTER TABLE `Question` MODIFY `type` ENUM('single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay', 'cloze', 'ordering', 'matching', 'numeric', 'cloze_select', 'statement_set', 'categorize', 'two_tier', 'recall_card', 'stepwise', 'highlight') NOT NULL;
